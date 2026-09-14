'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  AppBar,
  Toolbar,
  Container,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import CampaignIcon from '@mui/icons-material/Campaign';
import ChatIcon from '@mui/icons-material/Chat';

import WhatsAppConnect from '@/components/WhatsAppConnect';
import ContactManager from '@/components/ContactManager';
import TemplateManager from '@/components/TemplateManager';
import BroadcastSender from '@/components/BroadcastSender';
import CampaignHistory from '@/components/CampaignHistory';
import QuickChat from '@/components/QuickChat';

export default function Dashboard() {
  const [selectedTab, setSelectedTab] = useState<number>(0);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [messageText, setMessageText] = useState<string>('');
  const [historyRefreshKey, setHistoryRefreshKey] = useState<number>(0);

  const handleCampaignStarted = () => {
    setHistoryRefreshKey((prev) => prev + 1);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 6 }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: '#128C7E' }}>
        <Toolbar>
          <WhatsAppIcon sx={{ mr: 1.5, fontSize: 32 }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              WhatsApp CRM Pro
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.85, display: { xs: 'none', sm: 'block' } }}>
              স্মার্ট বাল্ক ব্রডকাস্ট, অডিয়েন্স ফিল্টার ও মিডিয়া সেন্ডার
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {/* 1. WhatsApp Connection Status + QR */}
        <WhatsAppConnect />

        {/* Tab Navigation */}
        <Paper sx={{ mb: 3, borderRadius: 2 }}>
          <Tabs
            value={selectedTab}
            onChange={(_, val) => setSelectedTab(val)}
            indicatorColor="primary"
            textColor="primary"
            variant="fullWidth"
          >
            <Tab
              icon={<CampaignIcon />}
              iconPosition="start"
              label="বাল্ক ব্রডকাস্ট ক্যাম্পেইন (Bulk Broadcast)"
              sx={{ fontWeight: 700, py: 1.5 }}
            />
            <Tab
              icon={<ChatIcon />}
              iconPosition="start"
              label="সরাসরি মেসেজ (Direct Quick Send)"
              sx={{ fontWeight: 700, py: 1.5 }}
            />
          </Tabs>
        </Paper>

        {selectedTab === 0 && (
          <Box>
            {/* Contact Manager with Tag Filter */}
            <ContactManager
              selectedIds={selectedContactIds}
              onSelectionChange={setSelectedContactIds}
            />

            {/* Templates + Broadcast side by side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 3fr' }, gap: 3, mb: 3, alignItems: 'start' }}>
              <TemplateManager onSelectTemplate={(content) => setMessageText(content)} />
              <BroadcastSender
                selectedContactIds={selectedContactIds}
                messageText={messageText}
                onMessageChange={setMessageText}
                onCampaignStarted={handleCampaignStarted}
              />
            </Box>

            {/* Campaign History & CSV Export */}
            <CampaignHistory key={historyRefreshKey} />
          </Box>
        )}

        {selectedTab === 1 && (
          <Box sx={{ maxWidth: 800, mx: 'auto' }}>
            <QuickChat />
          </Box>
        )}
      </Container>
    </Box>
  );
}
