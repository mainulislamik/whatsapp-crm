'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  CircularProgress,
  Chip,
  Alert,
  Stack,
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import LogoutIcon from '@mui/icons-material/Logout';
import { WhatsAppService } from '@/lib/api';

export default function WhatsAppConnect() {
  const [status, setStatus] = useState<string>('CONNECTING');
  const [user, setUser] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setError(null);
      const res = await WhatsAppService.getStatus();
      setStatus(res.data.status || 'DISCONNECTED');
      setUser(res.data.user || null);

      if (res.data.status === 'SCAN_QR' || res.data.hasQr) {
        const qrRes = await WhatsAppService.getQr();
        setQrCode(qrRes.data.qrDataUrl || null);
      } else {
        setQrCode(null);
      }
    } catch (err: any) {
      setError('Cannot establish connection to WhatsApp Engine.');
      setStatus('DISCONNECTED');
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    if (!confirm('Are you sure you want to log out from WhatsApp session?')) return;
    setLoading(true);
    try {
      await WhatsAppService.logout();
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await WhatsAppService.restart();
      setTimeout(fetchStatus, 2000);
    } catch (err: any) {
      setError(err.message || 'Restart failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2, gap: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <QrCodeScannerIcon color="primary" /> WhatsApp Connection Manager
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Scan the QR code with your mobile WhatsApp to link your account.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchStatus}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={handleRestart}
              disabled={loading}
            >
              Restart Engine
            </Button>
          </Stack>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* 1. Connected State */}
        {status === 'CONNECTED' && (
          <Box
            sx={{
              p: 3,
              bgcolor: '#ecfdf5',
              border: '1px solid #6ee7b7',
              borderRadius: 2,
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <CheckCircleIcon sx={{ fontSize: 48, color: '#10b981' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#065f46' }}>
                  Connected Account
                </Typography>
                <Typography variant="body2" sx={{ color: '#047857' }}>
                  Name: <b>{user?.name || 'Verified User'}</b> | Phone / JID: <b>{user?.id?.split('@')[0] || user?.id}</b>
                </Typography>
                <Chip label="Online & Ready" color="success" size="small" sx={{ mt: 1, fontWeight: 600 }} />
              </Box>
            </Stack>

            <Button
              variant="outlined"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              disabled={loading}
              sx={{ fontWeight: 600 }}
            >
              Log Out
            </Button>
          </Box>
        )}

        {/* 2. Scan QR State */}
        {status === 'SCAN_QR' && (
          <Box
            sx={{
              p: 3,
              bgcolor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 2,
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: 'center',
              justifyContent: 'space-around',
              gap: 3,
            }}
          >
            <Box sx={{ maxWidth: 400 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>
                Scan QR Code with WhatsApp:
              </Typography>
              <Box component="ol" sx={{ pl: 2, color: 'text.secondary', fontSize: '0.9rem', lineHeight: 1.8 }}>
                <li>Open WhatsApp on your mobile phone</li>
                <li>Go to <b>Settings</b> or <b>Menu (three dots)</b> &gt; <b>Linked Devices</b></li>
                <li>Tap <b>Link a Device</b> and point your camera at the QR code</li>
              </Box>
              <Chip label="Auto-refreshes every 20s" size="small" color="info" sx={{ mt: 1 }} />
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              {qrCode ? (
                <Box
                  component="img"
                  src={qrCode}
                  alt="WhatsApp QR Code"
                  sx={{
                    width: 240,
                    height: 240,
                    p: 1.5,
                    bgcolor: '#ffffff',
                    borderRadius: 2,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                />
              ) : (
                <Box sx={{ p: 6 }}>
                  <CircularProgress size={40} />
                  <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                    Generating QR code...
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        {/* 3. Connecting/Disconnected State */}
        {status !== 'CONNECTED' && status !== 'SCAN_QR' && (
          <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2 }}>
            <CircularProgress size={32} sx={{ mb: 2 }} />
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              {status === 'CONNECTING' ? 'Connecting to WhatsApp engine...' : 'Engine disconnected. Initializing...'}
            </Typography>
            <Button size="small" variant="outlined" sx={{ mt: 2 }} onClick={fetchStatus}>
              Retry
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
