'use client';

import React, { useState } from 'react';
import { Box, Typography, AppBar, Toolbar, Container } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import CampaignIcon from '@mui/icons-material/Campaign';

import WhatsAppConnect from '@/components/WhatsAppConnect';
import ContactManager from '@/components/ContactManager';
import TemplateManager from '@/components/TemplateManager';
import BroadcastSender from '@/components/BroadcastSender';
import CampaignHistory from '@/components/CampaignHistory';

export default function Dashboard() {
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [messageText, setMessageText] = useState<string>('');
  const [historyRefreshKey, setHistoryRefreshKey] = useState<number>(0);

  const handleCampaignStarted = () => {
    setHistoryRefreshKey((prev) => prev + 1);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: '#128C7E' }}>
        <Toolbar>
          <WhatsAppIcon sx={{ mr: 1.5, fontSize: 30 }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              WhatsApp CRM
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.85, display: { xs: 'none', sm: 'block' } }}>
              বাল্ক মেসেজ ব্রডকাস্ট সিস্টেম
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CampaignIcon sx={{ fontSize: 18, opacity: 0.9 }} />
            <Typography variant="body2" sx={{ opacity: 0.9, fontWeight: 600 }}>
              Broadcast Console
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {/* 1. WhatsApp Connection Status + QR */}
        <WhatsAppConnect />

        {/* 2. Contact Manager — select recipients */}
        <ContactManager
          selectedIds={selectedContactIds}
          onSelectionChange={setSelectedContactIds}
        />

        {/* 3. Templates + Broadcast side by side on large screens */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 3fr' }, gap: 3, mb: 3, alignItems: 'start' }}>
          <TemplateManager onSelectTemplate={(content) => setMessageText(content)} />
          <BroadcastSender
            selectedContactIds={selectedContactIds}
            messageText={messageText}
            onMessageChange={setMessageText}
            onCampaignStarted={handleCampaignStarted}
          />
        </Box>

        {/* 4. Campaign History & Live Status */}
        <CampaignHistory key={historyRefreshKey} />
      </Container>
    </Box>
  );
}
