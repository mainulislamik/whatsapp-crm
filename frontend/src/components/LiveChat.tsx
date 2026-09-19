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
  Tabs,
  Tab,
  Badge,
  Menu,
  MenuItem,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Card,
  CardMedia,
} from '@mui/material';
import {
  Send as SendIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  Groups as GroupsIcon,
  AttachFile as AttachFileIcon,
  Image as ImageIcon,
  Description as DescriptionIcon,
  Audiotrack as AudiotrackIcon,
  Done as DoneIcon,
  DoneAll as DoneAllIcon,
  AccessTime as AccessTimeIcon,
  Refresh as RefreshIcon,
  ArrowBack as ArrowBackIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
  InsertDriveFile as FileIcon,
  CheckCircle as CheckCircleIcon,
  Storefront as StorefrontIcon,
  LocationOn as LocationOnIcon,
  InfoOutlined as InfoIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  SmartToy as SmartToyIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import api, { ChatService, ChatListItem, ChatMessage, Lead, LeadService, WhatsAppService, BotService, CustomerMemory, RegDbService } from '@/lib/api';

interface LiveChatProps {
  onBack?: () => void;
}

export default function LiveChat({ onBack }: LiveChatProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatListItem | null>(null);
  const selectedPhoneRef = useRef<string | null>(null);
  selectedPhoneRef.current = selectedChat?.phone || null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'unread' | 'direct' | 'groups'>('all');
  const [waConnected, setWaConnected] = useState(true);
  const [isBotActive, setIsBotActive] = useState<boolean>(true);
  const [botToggling, setBotToggling] = useState<boolean>(false);
  
  // Attachments state
  const [attachAnchorEl, setAttachAnchorEl] = useState<null | HTMLElement>(null);
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    previewUrl?: string;
    mediaType: 'image' | 'document' | 'audio' | 'video';
    base64?: string;
  } | null>(null);

  // Preview Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Selected Chat Lead Details
  const [chatLead, setChatLead] = useState<Lead | null>(null);
  const [regInfo, setRegInfo] = useState<any | null>(null);
  const [customerMemory, setCustomerMemory] = useState<CustomerMemory | null>(null);
  const [loadingRegInfo, setLoadingRegInfo] = useState<boolean>(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  // Hidden File Inputs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages, scrollToBottom]);

  // Load chats list
  const fetchChats = async (isInitial = false) => {
    try {
      if (isInitial && chats.length === 0) {
        setLoading(true);
      }
      const res = await ChatService.list();
      const rawChats: ChatListItem[] = res.data || [];
      const updated = rawChats.map((c) => {
        if (selectedPhoneRef.current && selectedPhoneRef.current === c.phone) {
          return { ...c, unread_count: 0 };
        }
        return c;
      });
      setChats(updated);
      setWaConnected(true);
    } catch (err) {
      console.error('Failed to fetch chats:', err);
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  };

  // Load messages for a chat
  const fetchMessages = async (phone: string) => {
    try {
      const res = await ChatService.messages(phone, 150);
      setMessages(res.data || []);
      ChatService.markRead(phone).catch(() => {});
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  // Fetch lead info for selected chat
  const fetchLeadInfo = async (phone: string) => {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const localPhone = cleanPhone.startsWith('8801') ? '0' + cleanPhone.slice(2) : cleanPhone;
      const res = await LeadService.list({ search: localPhone });
      if (res.data && res.data.length > 0) {
        setChatLead(res.data[0]);
      } else {
        setChatLead(null);
      }
    } catch (e) {
      setChatLead(null);
    }
  };

  useEffect(() => {
    fetchChats(true);
  }, []);

  // --- REAL-TIME WEBSOCKET FOR 0ms LIVE CHAT & INSTANT DELIVERY TICKS ---
  useEffect(() => {
    let ws: any = null;
    let reconnectTimer: any = null;

    const connectWs = () => {
      try {
        if (typeof window === 'undefined') return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.hostname + ':8050/api/ws/chats';
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event: any) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'NEW_MESSAGE' && data.message) {
              const newMsg = data.message;
              const currentPhone = selectedPhoneRef.current;
              
              if (currentPhone && (newMsg.phone === currentPhone || currentPhone.endsWith(newMsg.phone.slice(-8)) || newMsg.phone.endsWith(currentPhone.slice(-8)))) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id || (newMsg.whatsapp_msg_id && m.whatsapp_msg_id === newMsg.whatsapp_msg_id))) {
                    return prev;
                  }
                  return [...prev, newMsg];
                });
                if (!newMsg.is_from_me) {
                  ChatService.markRead(currentPhone).catch(() => {});
                }
              }

              setChats((prev) => {
                const idx = prev.findIndex((c) => c.phone === newMsg.phone || (newMsg.phone && c.phone.endsWith(newMsg.phone.slice(-8))));
                if (idx !== -1) {
                  const updated = [...prev];
                  const target = { ...updated[idx] };
                  target.last_message = newMsg.message_text || newMsg.media_type || 'Media';
                  target.last_message_time = newMsg.timestamp || new Date().toISOString();
                  if (!newMsg.is_from_me && target.phone !== currentPhone) {
                    target.unread_count = (target.unread_count || 0) + 1;
                  }
                  updated.splice(idx, 1);
                  return [target, ...updated];
                } else {
                  fetchChats();
                  return prev;
                }
              });
            } else if (data.type === 'STATUS_UPDATE') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.whatsapp_msg_id === data.whatsapp_msg_id ? { ...m, status: data.status } : m
                )
              );
            }
          } catch (e) {}
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connectWs, 4000);
        };
        ws.onerror = () => {
          ws && ws.close();
        };
      } catch (e) {
        reconnectTimer = setTimeout(connectWs, 4000);
      }
    };

    connectWs();

    const pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Poll chats list every 6 seconds
  useEffect(() => {
    const chatInterval = setInterval(() => {
      fetchChats();
    }, 6000);
    return () => clearInterval(chatInterval);
  }, []);

  // Poll selected chat messages every 3.5 seconds
  useEffect(() => {
    if (!selectedChat) return;
    fetchLeadInfo(selectedChat.phone);
    fetchMessages(selectedChat.phone);

    const interval = setInterval(() => {
      fetchMessages(selectedChat.phone);
    }, 3500);
    return () => clearInterval(interval);
  }, [selectedChat?.phone]);

  const handleToggleBot = async () => {
    if (!selectedChat || botToggling) return;
    setBotToggling(true);
    try {
      const targetState = !isBotActive;
      const res = await BotService.toggleChat(selectedChat.phone, targetState);
      setIsBotActive(res.data.is_bot_active);
      setChats((prev) =>
        prev.map((c) =>
          c.phone === selectedChat.phone ? { ...c, is_bot_active: res.data.is_bot_active } : c
        )
      );
    } catch (e) {
      console.error('Failed to toggle AI Bot:', e);
    } finally {
      setBotToggling(false);
    }
  };

  const handleSelectChat = (chat: ChatListItem) => {
    selectedPhoneRef.current = chat.phone;
    setSelectedChat(chat);
    setIsBotActive(chat.is_bot_active !== false);
    BotService.getChatStatus(chat.phone)
      .then((res) => setIsBotActive(res.data.is_bot_active))
      .catch(() => {});
    setPendingFile(null);
    setMessageText('');
    setChats((prev) =>
      prev.map((c) => (c.phone === chat.phone ? { ...c, unread_count: 0 } : c))
    );
    ChatService.markRead(chat.phone).catch(() => {});
    setRegInfo(null);
    setCustomerMemory(null);
    api.get(`/chats/${encodeURIComponent(chat.phone)}/reg-info`)
      .then(r => setRegInfo(r.data))
      .catch(() => {});
    RegDbService.getCustomerMemory(chat.phone)
      .then(r => setCustomerMemory(r.data))
      .catch(() => {});
  };

  // Format timestamps nicely like WhatsApp Web
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = parseISO(isoString);
      return format(d, 'h:mm a');
    } catch (e) {
      return '';
    }
  };

  const formatChatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = parseISO(isoString);
      if (isToday(d)) return format(d, 'h:mm a');
      if (isYesterday(d)) return 'Yesterday';
      return format(d, 'dd/MM/yyyy');
    } catch (e) {
      return '';
    }
  };

  // Filtered chats based on search and tabs
  const filteredChats = chats.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.last_message.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    const isGroup = c.phone.includes('@g.us') || c.jid?.includes('@g.us');
    if (tabFilter === 'unread') return c.unread_count > 0;
    if (tabFilter === 'direct') return !isGroup;
    if (tabFilter === 'groups') return isGroup;
    return true;
  });

  // Handle file picker selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'image' | 'document' | 'audio' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      const previewUrl = mediaType === 'image' ? URL.createObjectURL(file) : undefined;
      setPendingFile({
        file,
        previewUrl,
        mediaType,
        base64,
      });
    };
    reader.readAsDataURL(file);
    setAttachAnchorEl(null);
    e.target.value = '';
  };

  // Send message or media
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedChat || sending) return;
    if (!messageText.trim() && !pendingFile) return;

    const text = messageText.trim();
    const currentPending = pendingFile;

    setMessageText('');
    setPendingFile(null);
    setSending(true);

    try {
      if (currentPending) {
        await ChatService.send(selectedChat.phone, {
          message: text,
          media_type: currentPending.mediaType,
          media_base64: currentPending.base64,
          file_name: currentPending.file.name,
          mime_type: currentPending.file.type,
        });
      } else {
        await ChatService.send(selectedChat.phone, { message: text });
      }
      await fetchMessages(selectedChat.phone);
      fetchChats();
    } catch (err: any) {
      console.error('Failed to send:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Render Status Tick Icon
  const renderStatusIcon = (status: string, isFromMe: boolean) => {
    if (!isFromMe) return null;
    const s = (status || 'SENT').toUpperCase();
    if (s === 'PENDING') {
      return <AccessTimeIcon sx={{ fontSize: 13, color: '#94a3b8', ml: 0.5 }} />;
    }
    if (s === 'SENT') {
      return <DoneIcon sx={{ fontSize: 14, color: '#94a3b8', ml: 0.5 }} />;
    }
    if (s === 'DELIVERED') {
      return <DoneAllIcon sx={{ fontSize: 14, color: '#94a3b8', ml: 0.5 }} />;
    }
    if (s === 'READ') {
      return <DoneAllIcon sx={{ fontSize: 14, color: '#53bdeb', ml: 0.5 }} />;
    }
    return <DoneIcon sx={{ fontSize: 14, color: '#94a3b8', ml: 0.5 }} />;
  };

  // Helper to construct accessible proxy media URL
  const getMediaUrl = (rawUrl: string) => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl;
    }
    const clean = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
    return `/api/proxy/${clean}`;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        height: 'calc(100vh - 120px)',
        minHeight: 580,
        bgcolor: '#f0f2f5',
        borderRadius: 3,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0',
      }}
    >
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e, 'image')}
      />
      <input
        type="file"
        ref={docInputRef}
        accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.zip"
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e, 'document')}
      />
      <input
        type="file"
        ref={audioInputRef}
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(e, 'audio')}
      />

      {/* ============================================================ */}
      {/* LEFT SIDEBAR: CHAT LIST (WhatsApp Web Style) */}
      {/* ============================================================ */}
      <Box
        sx={{
          width: { xs: '100%', md: 380 },
          maxWidth: 420,
          bgcolor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: isMobile && selectedChat ? 'none' : 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Sidebar Header */}
        <Box
          sx={{
            p: 1.5,
            bgcolor: '#f0f2f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ bgcolor: '#075e54', width: 38, height: 38, fontSize: 16, fontWeight: 700 }}>
              WA
            </Avatar>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                WhatsApp CRM
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e' }} />
                <Typography variant="caption" sx={{ color: '#64748b', fontSize: 11 }}>
                  Live Connected
                </Typography>
              </Stack>
            </Box>
          </Stack>
          <Tooltip title="Refresh chats">
            <IconButton size="small" onClick={() => fetchChats(true)} sx={{ color: '#64748b' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Search Bar */}
        <Box sx={{ p: 1.2, bgcolor: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: '#94a3b8', fontSize: 20, mr: 1 }} />,
              sx: {
                bgcolor: '#f0f2f5',
                borderRadius: 2,
                fontSize: '0.875rem',
                '& fieldset': { border: 'none' },
              },
            }}
          />
        </Box>

        {/* Chat Category Filter Tabs */}
        <Box sx={{ px: 1, pt: 0.5, bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
          <Tabs
            value={tabFilter}
            onChange={(_, val) => setTabFilter(val)}
            variant="scrollable"
            scrollButtons={false}
            sx={{
              minHeight: 36,
              '& .MuiTab-root': {
                minHeight: 32,
                py: 0.5,
                px: 1.5,
                fontSize: '0.78rem',
                fontWeight: 600,
                textTransform: 'none',
                borderRadius: 4,
                mr: 0.8,
                mb: 0.8,
                bgcolor: '#f1f5f9',
                color: '#64748b',
                '&.Mui-selected': {
                  bgcolor: '#dcf8c6',
                  color: '#075e54',
                },
              },
              '& .MuiTabs-indicator': { display: 'none' },
            }}
          >
            <Tab label="All" value="all" />
            <Tab
              label={
                <Badge
                  badgeContent={chats.reduce((acc, c) => acc + (c.unread_count || 0), 0)}
                  color="success"
                  sx={{ '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16 } }}
                >
                  Unread
                </Badge>
              }
              value="unread"
            />
            <Tab label="Direct" value="direct" />
            <Tab label="Groups" value="groups" />
          </Tabs>
        </Box>

        {/* Chat List */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
          {loading && chats.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={28} sx={{ color: '#25D366' }} />
            </Box>
          ) : filteredChats.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                No conversations found
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {filteredChats.map((chat) => {
                const isSelected = selectedChat?.phone === chat.phone;
                const isGroup = chat.phone.includes('@g.us') || chat.jid?.includes('@g.us');

                return (
                  <ListItem key={chat.phone} disablePadding divider>
                    <ListItemButton
                      onClick={() => handleSelectChat(chat)}
                      selected={isSelected}
                      sx={{
                        py: 1.5,
                        px: 2,
                        '&.Mui-selected': {
                          bgcolor: '#f0f2f5',
                          borderLeft: '4px solid #25D366',
                        },
                        '&:hover': { bgcolor: '#f8fafc' },
                      }}
                    >
                      <ListItemAvatar sx={{ minWidth: 54 }}>
                        <Avatar
                          src={chat.profile_picture || undefined}
                          sx={{
                            width: 44,
                            height: 44,
                            bgcolor: isGroup ? '#3b82f6' : '#059669',
                            fontWeight: 600,
                          }}
                        >
                          {isGroup ? <GroupsIcon /> : chat.name?.charAt(0).toUpperCase() || <PersonIcon />}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography
                              variant="subtitle2"
                              noWrap
                              sx={{
                                fontWeight: chat.unread_count > 0 ? 700 : 600,
                                color: '#0f172a',
                                maxWidth: 170,
                                fontSize: '0.92rem',
                              }}
                            >
                              {chat.name || chat.phone}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: chat.unread_count > 0 ? '#25D366' : '#94a3b8',
                                fontSize: '0.72rem',
                                fontWeight: chat.unread_count > 0 ? 700 : 400,
                              }}
                            >
                              {formatChatDate(chat.last_message_time)}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.3 }}>
                            <Typography
                              variant="body2"
                              noWrap
                              sx={{
                                color: chat.unread_count > 0 ? '#0f172a' : '#64748b',
                                fontSize: '0.82rem',
                                fontWeight: chat.unread_count > 0 ? 600 : 400,
                                maxWidth: 220,
                              }}
                            >
                              {chat.last_message || '—'}
                            </Typography>
                            {chat.unread_count > 0 && (
                              <Chip
                                label={chat.unread_count}
                                size="small"
                                sx={{
                                  height: 18,
                                  minWidth: 18,
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  bgcolor: '#25D366',
                                  color: '#fff',
                                }}
                              />
                            )}
                          </Box>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Box>

      {/* ============================================================ */}
      {/* MAIN CHAT CONVERSATION AREA */}
      {/* ============================================================ */}
      <Box
        sx={{
          flexGrow: 1,
          display: isMobile && !selectedChat ? 'none' : 'flex',
          flexDirection: 'column',
          bgcolor: '#efeae2',
          backgroundImage:
            'radial-gradient(#d1d7db 1px, transparent 1px), radial-gradient(#d1d7db 1px, #efeae2 1px)',
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px',
          position: 'relative',
        }}
      >
        {selectedChat ? (
          <>
            {/* WhatsApp Chat Top Header */}
            <Box
              sx={{
                p: 1.5,
                bgcolor: '#f0f2f5',
                borderBottom: '1px solid #d1d7db',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                zIndex: 10,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                {isMobile && (
                  <IconButton onClick={() => setSelectedChat(null)} size="small">
                    <ArrowBackIcon />
                  </IconButton>
                )}
                <Avatar
                  src={selectedChat.profile_picture || undefined}
                  sx={{
                    width: 40,
                    height: 40,
                    bgcolor: selectedChat.phone.includes('@g.us') ? '#3b82f6' : '#059669',
                    cursor: 'pointer',
                  }}
                  onClick={() => setShowInfoPanel(!showInfoPanel)}
                >
                  {selectedChat.phone.includes('@g.us') ? (
                    <GroupsIcon />
                  ) : (
                    selectedChat.name?.charAt(0).toUpperCase() || <PersonIcon />
                  )}
                </Avatar>
                <Box sx={{ cursor: 'pointer' }} onClick={() => setShowInfoPanel(!showInfoPanel)}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                    {selectedChat.name || selectedChat.phone}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    {selectedChat.phone.includes('@g.us')
                      ? 'WhatsApp Group'
                      : chatLead
                      ? `${chatLead.category || 'Lead'} • ${chatLead.shop_name || selectedChat.phone}`
                      : selectedChat.phone}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center">
                {chatLead && (
                  <Chip
                    size="small"
                    label={chatLead.category || 'Lead'}
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 600, fontSize: 11 }}
                  />
                )}
                <Tooltip title={isBotActive ? "AI Bot সক্রিয় আছে (পজ করতে ক্লিক করুন)" : "AI Bot পজ করা আছে (চালু করতে ক্লিক করুন)"}>
                  <Chip
                    icon={<SmartToyIcon sx={{ fontSize: '15px !important' }} />}
                    label={isBotActive ? "AI Bot: ON" : "AI Bot: OFF"}
                    size="small"
                    color={isBotActive ? "success" : "default"}
                    variant={isBotActive ? "filled" : "outlined"}
                    onClick={handleToggleBot}
                    sx={{
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: 'pointer',
                      bgcolor: isBotActive ? '#10b981' : undefined,
                      color: isBotActive ? '#ffffff' : '#64748b',
                      '&:hover': { opacity: 0.9 },
                    }}
                  />
                </Tooltip>
                <Tooltip title="Contact Info & Intelligence">
                  <IconButton
                    size="small"
                    onClick={() => setShowInfoPanel(!showInfoPanel)}
                    sx={{ color: showInfoPanel ? '#075e54' : '#64748b' }}
                  >
                    <InfoIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            {/* Chat Messages Stream */}
            <Box
              sx={{
                flexGrow: 1,
                overflowY: 'auto',
                p: { xs: 1.5, md: 3 },
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              {messages.map((m, idx) => {
                const isFromMe = m.is_from_me;
                const mediaUrl = m.media_url ? getMediaUrl(m.media_url) : '';

                // Date separator logic
                const currentDateStr = m.timestamp ? format(parseISO(m.timestamp), 'yyyy-MM-dd') : '';
                const prevDateStr =
                  idx > 0 && messages[idx - 1].timestamp
                    ? format(parseISO(messages[idx - 1].timestamp), 'yyyy-MM-dd')
                    : '';
                const showDateSeparator = currentDateStr !== prevDateStr;

                return (
                  <React.Fragment key={m.id || idx}>
                    {showDateSeparator && m.timestamp && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', my: 1.5 }}>
                        <Paper
                          elevation={0}
                          sx={{
                            px: 1.5,
                            py: 0.4,
                            bgcolor: '#ffffff',
                            borderRadius: 2,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                          }}
                        >
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, fontSize: 11 }}>
                            {isToday(parseISO(m.timestamp))
                              ? 'Today'
                              : isYesterday(parseISO(m.timestamp))
                              ? 'Yesterday'
                              : format(parseISO(m.timestamp), 'MMMM d, yyyy')}
                          </Typography>
                        </Paper>
                      </Box>
                    )}

                    {/* Message Bubble Container */}
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: isFromMe ? 'flex-end' : 'flex-start',
                        width: '100%',
                      }}
                    >
                      <Paper
                        elevation={1}
                        sx={{
                          p: 1,
                          px: 1.5,
                          maxWidth: { xs: '88%', sm: '75%', md: '65%' },
                          minWidth: 90,
                          bgcolor: isFromMe ? (m.sender_name === 'StockWhisk AI' ? '#e0f2fe' : '#d9fdd3') : '#ffffff',
                          color: '#111b21',
                          borderRadius: isFromMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                          boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                          position: 'relative',
                          wordBreak: 'break-word',
                        }}
                      >
                        {/* StockWhisk AI Sender Badge */}
                        {isFromMe && m.sender_name === 'StockWhisk AI' && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.4 }}>
                            <SmartToyIcon sx={{ fontSize: 13, color: '#0284c7' }} />
                            <Typography variant="caption" sx={{ color: '#0284c7', fontWeight: 700, fontSize: 10 }}>
                              StockWhisk AI Assistant
                            </Typography>
                          </Box>
                        )}
                        {/* Group Sender Name */}
                        {!isFromMe && m.sender_name && m.sender_name !== 'Me' && selectedChat.phone.includes('@g.us') && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: '#075e54',
                              fontWeight: 700,
                              display: 'block',
                              mb: 0.3,
                              fontSize: 11,
                            }}
                          >
                            {m.sender_name}
                          </Typography>
                        )}

                        {/* --- IMAGE MEDIA --- */}
                        {m.media_type === 'image' && mediaUrl && (
                          <Box sx={{ mb: 0.8, borderRadius: 2, overflow: 'hidden' }}>
                            <Box
                              component="img"
                              src={mediaUrl}
                              alt="WhatsApp Image"
                              onClick={() => setLightboxUrl(mediaUrl)}
                              sx={{
                                width: '100%',
                                maxHeight: 280,
                                objectFit: 'cover',
                                borderRadius: 1.5,
                                cursor: 'pointer',
                                transition: 'transform 0.2s',
                                '&:hover': { transform: 'scale(1.01)' },
                              }}
                            />
                          </Box>
                        )}

                        {/* --- AUDIO / VOICE NOTE MEDIA --- */}
                        {m.media_type === 'audio' && mediaUrl && (
                          <Box sx={{ mb: 0.8, p: 0.5, bgcolor: isFromMe ? '#c8f5be' : '#f8fafc', borderRadius: 2 }}>
                            <audio controls src={mediaUrl} style={{ width: '100%', height: 36 }} />
                          </Box>
                        )}

                        {/* --- DOCUMENT MEDIA --- */}
                        {m.media_type === 'document' && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              p: 1,
                              mb: 0.8,
                              bgcolor: isFromMe ? '#c8f5be' : '#f1f5f9',
                              borderRadius: 2,
                              gap: 1.5,
                            }}
                          >
                            <DescriptionIcon sx={{ color: '#075e54', fontSize: 32 }} />
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                              <Typography variant="body2" noWrap sx={{ fontWeight: 600, fontSize: 13 }}>
                                {m.file_name || 'Document file'}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                WhatsApp Document
                              </Typography>
                            </Box>
                            {mediaUrl && (
                              <IconButton
                                size="small"
                                component="a"
                                href={mediaUrl}
                                download={m.file_name || 'download'}
                                target="_blank"
                                sx={{ bgcolor: '#ffffff', '&:hover': { bgcolor: '#e2e8f0' } }}
                              >
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        )}

                        {/* --- TEXT CONTENT --- */}
                        {m.message_text && (
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.91rem',
                              lineHeight: 1.45,
                              whiteSpace: 'pre-wrap',
                              pr: 4,
                            }}
                          >
                            {m.message_text}
                          </Typography>
                        )}

                        {/* Bubble Timestamp & Status Tick */}
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            mt: 0.3,
                            float: 'right',
                          }}
                        >
                          <Typography variant="caption" sx={{ color: '#667781', fontSize: 10, lineHeight: 1 }}>
                            {formatTime(m.timestamp)}
                          </Typography>
                          {renderStatusIcon(m.status, isFromMe)}
                        </Box>
                      </Paper>
                    </Box>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </Box>

            {/* Pending Media Attachment Preview */}
            {pendingFile && (
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: '#ffffff',
                  borderTop: '1px solid #d1d7db',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                {pendingFile.previewUrl ? (
                  <Box
                    component="img"
                    src={pendingFile.previewUrl}
                    sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1.5 }}
                  />
                ) : (
                  <FileIcon sx={{ fontSize: 40, color: '#075e54' }} />
                )}
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
                    {pendingFile.file.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    {(pendingFile.file.size / 1024).toFixed(1)} KB • Ready to send
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => setPendingFile(null)} color="error">
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}

            {/* WhatsApp Input Bar */}
            <Box
              component="form"
              onSubmit={handleSend}
              sx={{
                p: 1.2,
                bgcolor: '#f0f2f5',
                borderTop: '1px solid #d1d7db',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {/* Attachment Button */}
              <IconButton
                onClick={(e) => setAttachAnchorEl(e.currentTarget)}
                sx={{ color: '#54656f', '&:hover': { bgcolor: '#e2e8f0' } }}
              >
                <AttachFileIcon />
              </IconButton>

              <Menu
                anchorEl={attachAnchorEl}
                open={Boolean(attachAnchorEl)}
                onClose={() => setAttachAnchorEl(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                PaperProps={{
                  sx: { borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 180 },
                }}
              >
                <MenuItem
                  onClick={() => {
                    imageInputRef.current?.click();
                    setAttachAnchorEl(null);
                  }}
                >
                  <ListItemIcon>
                    <ImageIcon sx={{ color: '#007bfc' }} />
                  </ListItemIcon>
                  Photos & Videos
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    docInputRef.current?.click();
                    setAttachAnchorEl(null);
                  }}
                >
                  <ListItemIcon>
                    <DescriptionIcon sx={{ color: '#5f66cd' }} />
                  </ListItemIcon>
                  Document / PDF
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    audioInputRef.current?.click();
                    setAttachAnchorEl(null);
                  }}
                >
                  <ListItemIcon>
                    <AudiotrackIcon sx={{ color: '#e53e3e' }} />
                  </ListItemIcon>
                  Audio / Voice
                </MenuItem>
              </Menu>

              {/* Message Input Field */}
              <TextField
                fullWidth
                size="small"
                multiline
                maxRows={4}
                placeholder="Type a message"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                InputProps={{
                  sx: {
                    bgcolor: '#ffffff',
                    borderRadius: 3,
                    fontSize: '0.92rem',
                    '& fieldset': { border: 'none' },
                    py: 1,
                    px: 1.5,
                  },
                }}
              />

              {/* Send FAB Button */}
              <IconButton
                type="submit"
                disabled={sending || (!messageText.trim() && !pendingFile)}
                sx={{
                  bgcolor: '#25D366',
                  color: '#ffffff',
                  width: 42,
                  height: 42,
                  '&:hover': { bgcolor: '#20ba59' },
                  '&.Mui-disabled': { bgcolor: '#d1d7db', color: '#8696a0' },
                }}
              >
                {sending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : <SendIcon fontSize="small" />}
              </IconButton>
            </Box>
          </>
        ) : (
          /* Empty Chat Placeholder */
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
              p: 4,
              textAlign: 'center',
            }}
          >
            <Avatar sx={{ width: 80, height: 80, bgcolor: '#dcf8c6', color: '#075e54', mb: 2 }}>
              <SendIcon sx={{ fontSize: 40 }} />
            </Avatar>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>
              WhatsApp CRM Pro Live Chat
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', maxWidth: 420 }}>
              Send and receive messages, media attachments, voice notes, and manage leads in real-time with full WhatsApp Web parity.
            </Typography>
          </Box>
        )}
      </Box>

      {/* ============================================================ */}
      {/* RIGHT SIDEBAR: CONTACT & LEAD INTELLIGENCE DRAWER */}
      {/* ============================================================ */}
      {showInfoPanel && selectedChat && (
        <Box
          sx={{
            width: { xs: '100%', md: 320 },
            bgcolor: '#ffffff',
            borderLeft: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Contact Details
            </Typography>
            <IconButton size="small" onClick={() => setShowInfoPanel(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Profile Overview */}
          <Box sx={{ p: 3, textAlign: 'center', bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <Avatar
              src={selectedChat.profile_picture || undefined}
              sx={{ width: 72, height: 72, margin: '0 auto 12px', bgcolor: '#059669', fontSize: 28, fontWeight: 700 }}
            >
              {selectedChat.name?.charAt(0).toUpperCase() || <PersonIcon fontSize="large" />}
            </Avatar>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
              {selectedChat.name || selectedChat.phone}
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 1 }}>
              {selectedChat.phone}
            </Typography>
            {chatLead?.is_on_whatsapp && (
              <Chip
                icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                label="Verified WhatsApp"
                size="small"
                color="success"
                sx={{ fontSize: 11, fontWeight: 600 }}
              />
            )}
          </Box>

          {/* StockWhisk Reg DB Profile */}
          <Box sx={{ p: 2.5, borderBottom: '1px solid #e2e8f0', bgcolor: regInfo?.is_registered ? '#f0fdf4' : '#f8fafc' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                StockWhisk Reg Status
              </Typography>
              {regInfo?.is_registered ? (
                <Chip size="small" color="success" label="Registered Shop" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
              ) : regInfo?.is_pending ? (
                <Chip size="small" color="warning" label="Pending OTP" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
              ) : (
                <Chip size="small" color="default" label="Not Registered" sx={{ height: 20, fontSize: 10, fontWeight: 600 }} />
              )}
            </Box>

            {regInfo?.is_registered && regInfo.shops && regInfo.shops.length > 0 ? (
              <Stack spacing={1.2}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>Registered Shop Name</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {regInfo.shops[0].name}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Plan Tier</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#059669' }}>
                      {regInfo.shops[0].plan_name || 'Standard'} ({regInfo.shops[0].tier || 'active'})
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Type</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                      {regInfo.shops[0].business_type || 'Retail'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            ) : regInfo?.is_pending && regInfo.pending && regInfo.pending.length > 0 ? (
              <Box>
                <Typography variant="caption" sx={{ color: '#64748b' }}>Pending Registration</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#d97706' }}>
                  {regInfo.pending[0].shop_name} ({regInfo.pending[0].owner_name || 'Owner'})
                </Typography>
              </Box>
            ) : (
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                Not registered as a customer in StockWhisk PostgreSQL DB yet.
              </Typography>
            )}
          </Box>

          {/* AI Customer Long-Term Memory */}
          {customerMemory && Object.keys(customerMemory).length > 0 && (
            <Box sx={{ p: 2.5, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  🧠 AI Customer Memory
                </Typography>
                <Chip size="small" label="Auto-Learned" sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: '#e0f2fe', color: '#0369a1' }} />
              </Box>
              <Stack spacing={1.2}>
                {customerMemory.shop_name && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Detected Shop</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>{customerMemory.shop_name}</Typography>
                  </Box>
                )}
                {customerMemory.owner_name && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Owner / Contact Person</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>{customerMemory.owner_name}</Typography>
                  </Box>
                )}
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  {customerMemory.business_type && (
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Business Type</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#0284c7' }}>{customerMemory.business_type}</Typography>
                    </Box>
                  )}
                  {customerMemory.location && (
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Location</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>{customerMemory.location}</Typography>
                    </Box>
                  )}
                </Box>
                {customerMemory.key_interests && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Key Interests</Typography>
                    <Typography variant="body2" sx={{ color: '#334155', fontSize: 13 }}>{customerMemory.key_interests}</Typography>
                  </Box>
                )}
                {customerMemory.last_topic && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Last Topic Discussed</Typography>
                    <Typography variant="body2" sx={{ color: '#475569', fontSize: 13, fontStyle: 'italic' }}>{customerMemory.last_topic}</Typography>
                  </Box>
                )}
              </Stack>
            </Box>
          )}

          {/* Lead Intelligence Data */}
          {chatLead ? (
            <Box sx={{ p: 2.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Lead Intelligence
              </Typography>
              <Stack spacing={2} sx={{ mt: 1.5 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Shop / Business Name
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                    {chatLead.shop_name || '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Category & Type
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                    {chatLead.category || '—'} • {chatLead.shop_type || '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Location / Address
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                    {chatLead.address || '—'}
                  </Typography>
                </Box>
                {chatLead.notes && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      Enrichment Notes
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#334155', whiteSpace: 'pre-wrap', fontSize: 12 }}>
                      {chatLead.notes}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Box>
          ) : (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: '#94a3b8', mb: 2 }}>
                Not registered as a Lead yet
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Lightbox Dialog for Image Preview */}
      <Dialog
        open={Boolean(lightboxUrl)}
        onClose={() => setLightboxUrl(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: 'transparent', boxShadow: 'none' } }}
      >
        <Box sx={{ position: 'relative', textAlign: 'center' }}>
          <IconButton
            onClick={() => setLightboxUrl(null)}
            sx={{
              position: 'absolute',
              top: 10,
              right: 10,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: '#ffffff',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
            }}
          >
            <CloseIcon />
          </IconButton>
          {lightboxUrl && (
            <Box
              component="img"
              src={lightboxUrl}
              alt="Zoomed preview"
              sx={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            />
          )}
        </Box>
      </Dialog>
    </Box>
  );
}
