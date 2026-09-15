'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  TextField,
  Button,
  IconButton,
  Divider,
  Stack,
  Typography,
  Chip,
  CircularProgress,
  Paper,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Send as SendIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { ChatService, ChatListItem, ChatMessage } from '@/lib/api';

interface LiveChatProps {
  onBack?: () => void;
}

const STATUS_COLORS = {
  SENT: '#94a3b8',
  DELIVERED: '#25D366',
  READ: '#25D366',
  FAILED: '#ef4444',
};

export default function LiveChat({ onBack }: LiveChatProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatListItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchChats = async () => {
    try {
      setLoading(true);
      const res = await ChatService.list();
      setChats(res.data || []);
    } catch (err) {
      console.error('Failed to fetch chats:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (phone: string) => {
    try {
      const res = await ChatService.messages(phone, 100);
      setMessages(res.data || []);
      ChatService.markRead(phone).catch(() => {});
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  useEffect(() => {
    fetchChats();
  }, []);

  // Poll for messages in selected chat
  useEffect(() => {
    if (!selectedChat) return;
    const interval = setInterval(() => {
      fetchMessages(selectedChat.phone);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedChat]);

  const handleSelectChat = (chat: ChatListItem) => {
    setSelectedChat(chat);
    fetchMessages(chat.phone);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!messageText.trim() || !selectedChat || sending) return;

    const text = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
        await ChatService.send(selectedChat.phone, { message: text });
        // Refresh messages
        fetchMessages(selectedChat.phone);
    } catch (err) {
      console.error('Failed to send:', err);
      alert('Failed to send.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '80vh', bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
      {/* Sidebar List */}
      <Box sx={{ width: 350, borderRight: '1px solid #e2e8f0', display: isMobile && selectedChat ? 'none' : 'block', overflowY: 'auto' }}>
        <TextField fullWidth size="small" placeholder="Search..." onChange={(e) => setSearchQuery(e.target.value)} sx={{ p: 1 }} />
        <List>
          {chats
            .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery))
            .map((chat) => (
              <ListItem key={chat.phone} disablePadding>
                <ListItemButton onClick={() => handleSelectChat(chat)} selected={selectedChat?.phone === chat.phone}>
                  <ListItemAvatar>
                    <Avatar src={chat.profile_picture || undefined}>
                      {!chat.profile_picture && <PersonIcon />}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={<Typography noWrap>{chat.name || chat.phone}</Typography>}
                    secondary={<Typography noWrap variant="caption">{chat.last_message}</Typography>}
                  />
                </ListItemButton>
              </ListItem>
            ))}
        </List>
      </Box>

      {/* Chat Area */}
      <Box sx={{ flexGrow: 1, display: isMobile && !selectedChat ? 'none' : 'flex', flexDirection: 'column' }}>
        {selectedChat ? (
          <>
            <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                <IconButton onClick={() => setSelectedChat(null)} sx={{ mr: 1, display: isMobile ? 'block' : 'none' }}>
                    <VisibilityOffIcon />
                </IconButton>
                <Typography variant="h6">{selectedChat.name}</Typography>
            </Box>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2, bgcolor: '#f0f2f5' }}>
              {messages.map((m) => (
                <Box key={m.id} sx={{ display: 'flex', justifyContent: m.is_from_me ? 'flex-end' : 'flex-start', mb: 1 }}>
                  <Paper sx={{ p: 1, bgcolor: m.is_from_me ? '#DCF8C6' : '#fff', borderRadius: 2 }}>
                    <Typography variant="body2">{m.message_text}</Typography>
                  </Paper>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Box>
            <Box sx={{ p: 2, display: 'flex', gap: 1, bgcolor: '#fff' }}>
              <TextField fullWidth size="small" value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} />
              <IconButton onClick={() => handleSend()} color="success">
                <SendIcon />
              </IconButton>
            </Box>
          </>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
            <Typography>Select a chat</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}