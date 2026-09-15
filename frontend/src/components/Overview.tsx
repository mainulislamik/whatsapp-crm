'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  Stack,
  LinearProgress,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import CampaignIcon from '@mui/icons-material/Campaign';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { ContactService, BroadcastService, WhatsAppService, Campaign } from '@/lib/api';

interface OverviewProps {
  onNavigate: (section: string) => void;
}

export default function Overview({ onNavigate }: OverviewProps) {
  const [stats, setStats] = useState({
    contactsCount: 0,
    campaignsCount: 0,
    sentCount: 0,
    failedCount: 0,
  });
  const [waStatus, setWaStatus] = useState<{ status: string; user?: any; hasQr: boolean } | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async () => {
    try {
      const [contactsRes, campsRes, waRes] = await Promise.all([
        ContactService.list(),
        BroadcastService.listCampaigns(),
        WhatsAppService.getStatus(),
      ]);

      const contacts = contactsRes.data || [];
      const campaigns = campsRes.data || [];
      const sent = campaigns.reduce((acc, c) => acc + (c.sent_count || 0), 0);
      const failed = campaigns.reduce((acc, c) => acc + (c.failed_count || 0), 0);

      setStats({
        contactsCount: contacts.length,
        campaignsCount: campaigns.length,
        sentCount: sent,
        failedCount: failed,
      });

      setWaStatus(waRes.data);
      setRecentCampaigns(campaigns.slice(0, 4));
    } catch (err) {
      console.error('Failed to load overview stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box>
      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {/* Top Banner: WhatsApp Live Status */}
      <Card
        sx={{
          mb: 3,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          borderRadius: 3,
          p: 1,
        }}
      >
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, gap: 2 }}
          >
            <Box>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.8 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    bgcolor: 'rgba(37, 211, 102, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <WhatsAppIcon sx={{ color: '#25D366', fontSize: 28 }} />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#ffffff' }}>
                    WhatsApp CRM Dashboard
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                    Smart Contact Management & Safe Bulk Broadcast Engine
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Chip
                label={
                  waStatus?.status === 'CONNECTED'
                    ? `Connected: ${waStatus.user?.name || waStatus.user?.id?.split(':')[0] || 'WhatsApp'}`
                    : waStatus?.status === 'SCAN_QR'
                    ? 'QR Scan Required'
                    : 'Disconnected'
                }
                color={
                  waStatus?.status === 'CONNECTED'
                    ? 'success'
                    : waStatus?.status === 'SCAN_QR'
                    ? 'warning'
                    : 'error'
                }
                sx={{ fontWeight: 700, px: 1 }}
              />
              {waStatus?.status !== 'CONNECTED' && (
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  startIcon={<QrCodeScannerIcon />}
                  onClick={() => onNavigate('device')}
                  sx={{ fontWeight: 700 }}
                >
                  Scan QR
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* 4 Stat Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2.5, mb: 3.5 }}>
        {/* Contacts */}
        <Card sx={{ borderLeft: '4px solid #3b82f6' }}>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Total Contacts
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
                  {stats.contactsCount}
                </Typography>
              </Box>
              <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#eff6ff', color: '#3b82f6' }}>
                <PeopleIcon fontSize="medium" />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Campaigns */}
        <Card sx={{ borderLeft: '4px solid #8b5cf6' }}>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Total Campaigns
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
                  {stats.campaignsCount}
                </Typography>
              </Box>
              <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#f5f3ff', color: '#8b5cf6' }}>
                <CampaignIcon fontSize="medium" />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Sent */}
        <Card sx={{ borderLeft: '4px solid #10b981' }}>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Messages Sent
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#10b981', mt: 0.5 }}>
                  {stats.sentCount}
                </Typography>
              </Box>
              <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#ecfdf5', color: '#10b981' }}>
                <CheckCircleIcon fontSize="medium" />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Failed */}
        <Card sx={{ borderLeft: '4px solid #ef4444' }}>
          <CardContent>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Failed Messages
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, color: stats.failedCount > 0 ? '#ef4444' : '#64748b', mt: 0.5 }}>
                  {stats.failedCount}
                </Typography>
              </Box>
              <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#fef2f2', color: '#ef4444' }}>
                <ErrorOutlineIcon fontSize="medium" />
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* Quick Launchpad Buttons */}
      <Card sx={{ mb: 3.5 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
            Quick Launchpad
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<SendIcon />}
              onClick={() => onNavigate('broadcast')}
              sx={{ py: 1.5, justifyContent: 'flex-start', fontWeight: 700 }}
            >
              New Bulk Broadcast
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<ChatIcon />}
              onClick={() => onNavigate('quickchat')}
              sx={{ py: 1.5, justifyContent: 'flex-start', fontWeight: 700 }}
            >
              Direct Quick Message
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<PeopleIcon />}
              onClick={() => onNavigate('contacts')}
              sx={{ py: 1.5, justifyContent: 'flex-start', fontWeight: 700 }}
            >
              Contacts & Audience
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<QrCodeScannerIcon />}
              onClick={() => onNavigate('device')}
              sx={{ py: 1.5, justifyContent: 'flex-start', fontWeight: 700 }}
            >
              WhatsApp Device Link
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Recent Campaigns Widget */}
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Recent Campaigns
            </Typography>
            <Button
              size="small"
              endIcon={<ArrowForwardIcon />}
              onClick={() => onNavigate('reports')}
              sx={{ fontWeight: 700 }}
            >
              View All Reports
            </Button>
          </Stack>

          {recentCampaigns.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
              No campaigns found.
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {recentCampaigns.map((camp) => (
                <Box
                  key={camp.id}
                  sx={{
                    p: 1.5,
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    bgcolor: '#ffffff',
                    '&:hover': { bgcolor: '#f8fafc' },
                  }}
                >
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {camp.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Recipients: {camp.total_recipients} | Sent: {camp.sent_count} | Failed: {camp.failed_count}
                    </Typography>
                  </Box>
                  <Chip
                    label={camp.status}
                    size="small"
                    color={camp.status === 'COMPLETED' ? 'success' : camp.status === 'RUNNING' ? 'warning' : 'default'}
                    sx={{ fontWeight: 700 }}
                  />
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
