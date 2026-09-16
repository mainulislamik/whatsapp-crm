'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  AppBar,
  Toolbar,
  IconButton,
  Drawer,
  Chip,
  Button,
  Stack,
  useMediaQuery,
  useTheme,
  Alert,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import RefreshIcon from '@mui/icons-material/Refresh';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import SendIcon from '@mui/icons-material/Send';
import PeopleIcon from '@mui/icons-material/People';

import Sidebar, { navItems } from '@/components/Sidebar';
import Overview from '@/components/Overview';
import TemplateManager from '@/components/TemplateManager';
import BroadcastSender from '@/components/BroadcastSender';
import CampaignHistory from '@/components/CampaignHistory';
import QuickChat from '@/components/QuickChat';
import WhatsAppConnect from '@/components/WhatsAppConnect';
import LeadManager from '@/components/LeadManager';
import LiveChat from '@/components/LiveChat';
import LoginPage from '@/components/LoginPage';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { WhatsAppService } from '@/lib/api';

const DRAWER_WIDTH = 280;

export default function Dashboard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [activeSection, setActiveSectionState] = useState<string>('overview');
  const [currentUser, setCurrentUser] = useState<{ username: string; name: string; token: string } | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('wa_crm_token');
      const savedUser = localStorage.getItem('wa_crm_user');
      if (token && savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setCurrentUser({ token, username: parsed.username, name: parsed.name });
        } catch {
          // invalid json
        }
      }
      setAuthChecking(false);
    }
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wa_crm_token');
      localStorage.removeItem('wa_crm_user');
    }
    setCurrentUser(null);
  };

  const updateSection = (sec: string) => {
    setActiveSectionState(sec);
    if (typeof window !== 'undefined') {
      window.location.hash = sec;
      localStorage.setItem('wa_crm_active_section', sec);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      const saved = localStorage.getItem('wa_crm_active_section');
      const target = hash || saved;
      if (target && navItems.some((item) => item.id === target)) {
        setActiveSectionState(target);
      }
    }
  }, []);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [messageText, setMessageText] = useState<string>('');
  const [templateMedia, setTemplateMedia] = useState<any>(null);
  const [directChatPhone, setDirectChatPhone] = useState<string>('');
  const [historyRefreshKey, setHistoryRefreshKey] = useState<number>(0);
  const [waStatus, setWaStatus] = useState<{ status: string; user?: any; hasQr: boolean } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await WhatsAppService.getStatus();
      setWaStatus(res.data);
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const currentNav = navItems.find((n) => n.id === activeSection) || navItems[0];

  if (authChecking) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Chip label="Loading WhatsApp CRM..." sx={{ bgcolor: '#128C7E', color: '#ffffff', fontWeight: 700 }} />
      </Box>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f8fafc' }}>
      {/* 1. Sidebar for Desktop */}
      <Box
        component="nav"
        sx={{
          width: { md: DRAWER_WIDTH },
          flexShrink: { md: 0 },
          display: { xs: 'none', md: 'block' },
        }}
      >
        <Box
          sx={{
            width: DRAWER_WIDTH,
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: 0,
            zIndex: 1200,
          }}
        >
          <Sidebar
            currentSection={activeSection}
            onSelectSection={updateSection}
            waStatus={waStatus}
          />
        </Box>
      </Box>

      {/* 2. Sidebar Drawer for Mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH, bgcolor: '#0f172a' },
        }}
      >
        <Sidebar
          currentSection={activeSection}
          onSelectSection={updateSection}
          waStatus={waStatus}
          onCloseMobile={() => setMobileOpen(false)}
        />
      </Drawer>

      {/* 3. Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Topbar Header */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: '#ffffff',
            color: '#0f172a',
            borderBottom: '1px solid #e2e8f0',
            zIndex: 1100,
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between', py: 1 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <IconButton
                color="inherit"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ display: { md: 'none' } }}
              >
                <MenuIcon />
              </IconButton>
              <Box>
                {/* Sidebar matches Page Title */}
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                  {currentNav.label}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  {currentNav.sublabel}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Chip
                label={
                  waStatus?.status === 'CONNECTED'
                    ? `Online: ${waStatus.user?.name || waStatus.user?.id?.split(':')[0] || 'WhatsApp'}`
                    : waStatus?.status === 'SCAN_QR'
                    ? 'Scan QR'
                    : 'Offline'
                }
                color={
                  waStatus?.status === 'CONNECTED'
                    ? 'success'
                    : waStatus?.status === 'SCAN_QR'
                    ? 'warning'
                    : 'default'
                }
                size="small"
                sx={{ fontWeight: 700 }}
              />

              {waStatus?.status !== 'CONNECTED' && (
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={<QrCodeScannerIcon />}
                  onClick={() => updateSection('device')}
                  sx={{ fontWeight: 700, display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  Connect
                </Button>
              )}

              {/* Logged in User Profile & Logout */}
              {currentUser && (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 1 }}>
                  <Chip
                    icon={<AccountCircleIcon style={{ color: '#128C7E' }} />}
                    label={currentUser.name || currentUser.username}
                    variant="outlined"
                    size="small"
                    sx={{ fontWeight: 700, borderColor: '#cbd5e1', bgcolor: '#f1f5f9' }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<LogoutIcon fontSize="small" />}
                    onClick={handleLogout}
                    sx={{ fontWeight: 700, borderRadius: 2 }}
                  >
                    Logout
                  </Button>
                </Stack>
              )}

              <IconButton size="small" onClick={fetchStatus} sx={{ color: '#64748b' }}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Toolbar>
        </AppBar>

        {/* Dynamic Section Content */}
        <Box sx={{ p: { xs: 2, md: 3.5 }, flexGrow: 1 }}>
          {/* Notification banner if QR code scan is pending and not on device tab */}
          {waStatus?.status === 'SCAN_QR' && activeSection !== 'device' && (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" size="small" onClick={() => updateSection('device')}>
                  View QR Code
                </Button>
              }
              sx={{ mb: 3 }}
            >
              Please link your WhatsApp account by scanning the QR code before sending messages.
            </Alert>
          )}

          {/* 1. Dashboard Overview */}
          {activeSection === 'overview' && (
            <Overview onNavigate={(sec) => updateSection(sec)} />
          )}

          {/* 2. Lead Management (Unified Contact & Lead Directory) */}
          {activeSection === 'leads' && (
            <LeadManager
              onDirectMessage={(phone) => {
                setDirectChatPhone(phone);
                updateSection('quickchat');
              }}
              onSelectForBroadcast={(leadIds) => {
                setSelectedContactIds(leadIds);
                updateSection('broadcast');
              }}
            />
          )}

          {/* Live Chat */}
          {activeSection === 'livechat' && (
            <Box sx={{ maxWidth: '100%', mx: 0 }}>
              <LiveChat onBack={() => updateSection('overview')} />
            </Box>
          )}

          {/* 3. Bulk Broadcast */}
          {activeSection === 'broadcast' && (
            <Box>
              {selectedContactIds.length === 0 && (
                <Alert
                  severity="info"
                  action={
                    <Button color="inherit" size="small" startIcon={<PeopleIcon />} onClick={() => updateSection('leads')}>
                      Select from Leads
                    </Button>
                  }
                  sx={{ mb: 3 }}
                >
                  No leads selected. Click "Select Leads" or pick shops from the "Lead Management" page to broadcast.
                </Alert>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 3fr' }, gap: 3, alignItems: 'start' }}>
                <TemplateManager
                  onSelectTemplate={(content, media) => {
                    setMessageText(content);
                    setTemplateMedia(media || null);
                  }}
                />
                <BroadcastSender
                  selectedContactIds={selectedContactIds}
                  onSelectedContactIdsChange={setSelectedContactIds}
                  onGoToLeads={() => updateSection('leads')}
                  messageText={messageText}
                  onMessageChange={setMessageText}
                  templateMedia={templateMedia}
                  onCampaignStarted={() => {
                    setHistoryRefreshKey((prev) => prev + 1);
                    updateSection('reports');
                  }}
                />
              </Box>
            </Box>
          )}

          {/* 4. Direct Quick Chat */}
          {activeSection === 'quickchat' && (
            <Box sx={{ maxWidth: 800, mx: 'auto' }}>
              <QuickChat initialPhone={directChatPhone} />
            </Box>
          )}

          {/* 5. Templates Library */}
          {activeSection === 'templates' && (
            <Box sx={{ maxWidth: 900, mx: 'auto' }}>
              <TemplateManager
                onSelectTemplate={(content, media) => {
                  setMessageText(content);
                  setTemplateMedia(media || null);
                  updateSection('broadcast');
                }}
              />
            </Box>
          )}

          {/* 6. Reports & Delivery Logs */}
          {activeSection === 'reports' && (
            <CampaignHistory key={historyRefreshKey} />
          )}

          {/* 7. WhatsApp Device & QR Connection */}
          {activeSection === 'device' && (
            <Box sx={{ maxWidth: 850, mx: 'auto' }}>
              <WhatsAppConnect />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
