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
import ContactManager from '@/components/ContactManager';
import TemplateManager from '@/components/TemplateManager';
import BroadcastSender from '@/components/BroadcastSender';
import CampaignHistory from '@/components/CampaignHistory';
import QuickChat from '@/components/QuickChat';
import WhatsAppConnect from '@/components/WhatsAppConnect';
import { WhatsAppService } from '@/lib/api';

const DRAWER_WIDTH = 280;

export default function Dashboard() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [activeSection, setActiveSection] = useState<string>('overview');
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [messageText, setMessageText] = useState<string>('');
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
            onSelectSection={setActiveSection}
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
          onSelectSection={setActiveSection}
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
                    ? `অনলাইন: ${waStatus.user?.name || waStatus.user?.id?.split(':')[0] || 'WhatsApp'}`
                    : waStatus?.status === 'SCAN_QR'
                    ? 'QR স্ক্যান করুন'
                    : 'অফলাইন'
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
                  onClick={() => setActiveSection('device')}
                  sx={{ fontWeight: 700, display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  কানেক্ট করুন
                </Button>
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
                <Button color="inherit" size="small" onClick={() => setActiveSection('device')}>
                  QR কোড দেখুন
                </Button>
              }
              sx={{ mb: 3 }}
            >
              মেসেজ পাঠানোর পূর্বে আপনার মোবাইল থেকে WhatsApp QR কোড স্ক্যান করে ডিভাইস কানেক্ট করুন।
            </Alert>
          )}

          {/* 1. Dashboard Overview */}
          {activeSection === 'overview' && (
            <Overview onNavigate={(sec) => setActiveSection(sec)} />
          )}

          {/* 2. Contacts CRM */}
          {activeSection === 'contacts' && (
            <Box>
              <ContactManager
                selectedIds={selectedContactIds}
                onSelectionChange={setSelectedContactIds}
              />
              {selectedContactIds.length > 0 && (
                <Box sx={{ mt: 2, textAlign: 'right' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={<SendIcon />}
                    onClick={() => setActiveSection('broadcast')}
                    sx={{ px: 3, fontWeight: 700 }}
                  >
                    সিলেক্টেড {selectedContactIds.length} জনকে বাল্ক মেসেজ পাঠান
                  </Button>
                </Box>
              )}
            </Box>
          )}

          {/* 3. Bulk Broadcast */}
          {activeSection === 'broadcast' && (
            <Box>
              {selectedContactIds.length === 0 && (
                <Alert
                  severity="info"
                  action={
                    <Button color="inherit" size="small" startIcon={<PeopleIcon />} onClick={() => setActiveSection('contacts')}>
                      কন্টাক্টস সিলেক্ট করুন
                    </Button>
                  }
                  sx={{ mb: 3 }}
                >
                  কোনো কন্টাক্ট নির্বাচিত নেই। আপনি "কন্টাক্টস ও অডিয়েন্স" পেইজ থেকে এক ক্লিকে ট্যাগ বা অল সিলেক্ট করতে পারেন।
                </Alert>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 3fr' }, gap: 3, alignItems: 'start' }}>
                <TemplateManager onSelectTemplate={(content) => setMessageText(content)} />
                <BroadcastSender
                  selectedContactIds={selectedContactIds}
                  messageText={messageText}
                  onMessageChange={setMessageText}
                  onCampaignStarted={() => {
                    setHistoryRefreshKey((prev) => prev + 1);
                    setActiveSection('reports');
                  }}
                />
              </Box>
            </Box>
          )}

          {/* 4. Direct Quick Chat */}
          {activeSection === 'quickchat' && (
            <Box sx={{ maxWidth: 800, mx: 'auto' }}>
              <QuickChat />
            </Box>
          )}

          {/* 5. Templates Library */}
          {activeSection === 'templates' && (
            <Box sx={{ maxWidth: 900, mx: 'auto' }}>
              <TemplateManager
                onSelectTemplate={(content) => {
                  setMessageText(content);
                  setActiveSection('broadcast');
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
