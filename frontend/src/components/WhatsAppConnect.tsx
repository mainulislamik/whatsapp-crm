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
      setError('WhatsApp ইঞ্জিনের সাথে সংযোগ স্থাপন করা যাচ্ছে না।');
      setStatus('DISCONNECTED');
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    if (!confirm('আপনি কি নিশ্চিত যে WhatsApp সেশন লগআউট করতে চান?')) return;
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
    <Card sx={{ mb: 3, borderLeft: '6px solid #25D366' }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <QrCodeScannerIcon color="primary" /> WhatsApp কানেকশন স্ট্যাটাস
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              বাল্ক মেসেজ পাঠানোর জন্য আপনার WhatsApp অ্যাকাউন্ট কানেক্ট থাকতে হবে।
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {status === 'CONNECTED' && (
              <Chip
                icon={<CheckCircleIcon />}
                label={`সংযুক্ত (${user?.id ? user.id.split(':')[0] : 'WhatsApp User'})`}
                color="success"
                variant="filled"
                sx={{ fontWeight: 600 }}
              />
            )}
            {status === 'SCAN_QR' && (
              <Chip
                icon={<QrCodeScannerIcon />}
                label="QR কোড স্ক্যান করুন"
                color="warning"
                variant="filled"
                sx={{ fontWeight: 600 }}
              />
            )}
            {status === 'CONNECTING' && (
              <Chip
                label="কানেক্ট হচ্ছে..."
                color="info"
                variant="outlined"
              />
            )}
            {status === 'DISCONNECTED' && (
              <Chip
                icon={<ErrorOutlineIcon />}
                label="সংযোগ বিচ্ছিন্ন"
                color="error"
                variant="filled"
              />
            )}

            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={fetchStatus}
              disabled={loading}
            >
              রিফ্রেশ
            </Button>

            {status === 'CONNECTED' && (
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
                disabled={loading}
              >
                লগআউট
              </Button>
            )}
          </Stack>
        </Stack>

        {error && (
          <Alert severity="warning" sx={{ mt: 2 }} action={
            <Button color="inherit" size="small" onClick={handleRestart}>
              রিস্টার্ট ইঞ্জিন
            </Button>
          }>
            {error}
          </Alert>
        )}

        {status === 'SCAN_QR' && qrCode && (
          <Box sx={{ mt: 3, textAlign: 'center', p: 2, bgcolor: '#f1f5f9', borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              নিচের QR কোডটি আপনার মোবাইলের WhatsApp দিয়ে স্ক্যান করুন
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              WhatsApp ওপেন করুন ➜ মেনু (তিন ডট) বা সেটিংস ➜ <b>Linked Devices</b> ➜ <b>Link a Device</b>
            </Typography>
            <Box
              component="img"
              src={qrCode}
              alt="WhatsApp QR Code"
              sx={{
                width: 260,
                height: 260,
                border: '4px solid #ffffff',
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
