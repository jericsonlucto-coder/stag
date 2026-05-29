const loadMoreMessages = async () => {
  if (isLoadingMore || !hasMoreMessages || messages.length === 0) return;
  
  setIsLoadingMore(true);
  try {
    const oldestMessage = messages[0];
    if (!oldestMessage) return;
    
    // Get messages older than the oldest message
    const res = await api.getMessagesBefore(oldestMessage.id, MESSAGES_PER_PAGE);
    const messagesData: Record<string, any> = await res.json();
    
    // Convert messages to array and add to map
    const messagesMap = new Map();
    Object.entries(messagesData || {}).forEach(([key, msg]) => {
      if (msg?.text && msg?.username) {
        messagesMap.set(key, {
          id: key,
          text: msg.text,
          username: msg.username,
          timestamp: msg.timestamp || Date.now(),
          userId: msg.userId || "",
          status: "delivered" as MessageStatus,
          reactions: sanitizeReactions(msg.reactions || []),
          type: msg.type || "text",
          imageId: msg.imageId,
        });
      }
    });
    
    // Get images for these messages
    const imagesRes = await fetch(`${FIREBASE_DB_URL}/images.json`);
    const imagesData: Record<string, any> = await imagesRes.json();
    
    // Store images in a map for quick lookup
    const imagesMap = new Map();
    Object.entries(imagesData || {}).forEach(([key, image]) => {
      if (image?.full && image?.thumbnail) {
        imagesMap.set(key, {
          full: image.full,
          thumbnail: image.thumbnail,
          timestamp: image.timestamp || 0,
        });
      }
    });
    
    // Enrich older messages with images
    const olderMessages: Message[] = Array.from(messagesMap.values())
      .map((msg: Message) => {
        if (msg.type === "image" && msg.imageId) {
          const imageData = imagesMap.get(msg.imageId);
          if (imageData) {
            return {
              ...msg,
              imageUrl: imageData.full,
              imageThumbnail: imageData.thumbnail,
            };
          }
        }
        return msg;
      })
      .sort((a, b) => a.timestamp - b.timestamp); // Sort oldest first
    
    if (olderMessages.length === 0 || olderMessages.length < MESSAGES_PER_PAGE) {
      setHasMoreMessages(false);
    } else {
      // Check if there are even older messages
      const newOldestMessage = olderMessages[0];
      const olderCheck = await fetch(`${FIREBASE_DB_URL}/messages.json?orderBy="$key"&endBefore="${newOldestMessage.id}"&limitToLast=1`);
      const olderData = await olderCheck.json();
      setHasMoreMessages(Object.keys(olderData || {}).length > 0);
    }
    
    if (olderMessages.length > 0) {
      const scrollHeightBefore = messagesContainerRef.current?.scrollHeight || 0;
      const scrollTopBefore = messagesContainerRef.current?.scrollTop || 0;
      
      setMessages(prev => [...olderMessages, ...prev]);
      
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const newScrollHeight = messagesContainerRef.current.scrollHeight;
          const heightDifference = newScrollHeight - scrollHeightBefore;
          messagesContainerRef.current.scrollTop = scrollTopBefore + heightDifference;
        }
        setShowLoadMoreButton(false);
      }, 100);
    }
  } catch (err) {
    console.error("Error loading more messages:", err);
  } finally {
    setIsLoadingMore(false);
  }
};