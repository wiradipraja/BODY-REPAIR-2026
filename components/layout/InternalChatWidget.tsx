
import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, INTERNAL_CHATS_COLLECTION } from '../../services/firebase';
import { ChatMessage, UserProfile } from '../../types';
import { MessageCircle, Send, X, Minimize2, User, Loader2, AlertCircle } from 'lucide-react';

interface InternalChatWidgetProps {
  currentUser: UserProfile;
}

const InternalChatWidget: React.FC<InternalChatWidgetProps> = ({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
        setLoading(true);
        setError(null);
        
        // Correct Query: Get 50 newest messages (desc), then reverse them for display
        const q = query(
            collection(db, INTERNAL_CHATS_COLLECTION),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const msgs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as ChatMessage));
                
                // Reverse to display oldest -> newest (bottom)
                setMessages(msgs.reverse());
                setLoading(false);
                setTimeout(scrollToBottom, 100);
            },
            (err) => {
                console.error("Chat Error:", err);
                setError("Gagal memuat chat. Periksa koneksi/izin.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }
  }, [isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim()) return;

      try {
          await addDoc(collection(db, INTERNAL_CHATS_COLLECTION), {
              text: newMessage,
              senderId: currentUser.uid,
              senderName: currentUser.displayName || 'User',
              senderRole: currentUser.role || 'Staff',
              createdAt: serverTimestamp()
          });
          setNewMessage('');
          // Optimistic scroll
          setTimeout(scrollToBottom, 50);
      } catch (error) {
          console.error("Error sending message:", error);
      }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {/* Chat Window */}
        {isOpen && (
            <div className="mb-4 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[500px] max-h-[80vh] animate-pop-in ring-1 ring-black/5">
                {/* Header */}
                <div className="bg-indigo-600 p-4 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="font-bold text-sm flex items-center gap-2">
                            <MessageCircle size={18}/> ReForma Team Chat
                        </h3>
                        <p className="text-[10px] text-indigo-200">Internal Communication Channel</p>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-full transition-colors"><Minimize2 size={16}/></button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-grow overflow-y-auto p-4 bg-gray-50 scrollbar-thin space-y-3">
                    {loading ? (
                        <div className="flex justify-center items-center h-full text-gray-400">
                            <Loader2 className="animate-spin" size={24}/>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col justify-center items-center h-full text-red-400 text-xs text-center p-4">
                            <AlertCircle size={24} className="mb-2"/>
                            {error}
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="text-center text-gray-400 text-xs mt-10">
                            <p>Belum ada pesan.</p>
                            <p className="text-[10px] mt-1">Mulai percakapan dengan tim!</p>
                        </div>
                    ) : (
                        messages.map(msg => {
                            const isMe = msg.senderId === currentUser.uid;
                            return (
                                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'}`}>
                                        {!isMe && (
                                            <p className="text-[10px] font-bold text-indigo-600 mb-0.5 flex items-center gap-1">
                                                {msg.senderName} <span className="text-gray-400 font-normal">• {msg.senderRole}</span>
                                            </p>
                                        )}
                                        <p className="leading-relaxed break-words">{msg.text}</p>
                                    </div>
                                    <span className="text-[9px] text-gray-400 mt-1 px-1">
                                        {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Sending...'}
                                    </span>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-gray-100 flex gap-2 shrink-0">
                    <input 
                        type="text" 
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder="Ketik pesan..."
                        className="flex-grow bg-gray-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button 
                        type="submit" 
                        disabled={!newMessage.trim()}
                        className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                    >
                        <Send size={18}/>
                    </button>
                </form>
            </div>
        )}

        {/* Toggle Button */}
        <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`p-4 rounded-full shadow-2xl transition-all transform hover:scale-110 active:scale-95 flex items-center justify-center relative ${isOpen ? 'bg-gray-200 text-gray-600 rotate-90' : 'bg-indigo-600 text-white'}`}
        >
            {isOpen ? <X size={24}/> : <MessageCircle size={28} className="fill-white"/>}
            {!isOpen && (
                <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
            )}
        </button>
    </div>
  );
};

export default InternalChatWidget;
