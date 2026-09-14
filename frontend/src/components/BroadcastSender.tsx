'use client';

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Slider,
  Chip,
  Alert,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SecurityIcon from '@mui/icons-material/Security';
import { BroadcastService } from '@/lib/api';

interface BroadcastSenderProps {
  selectedContactIds: number[];
  messageText: string;
  onMessageChange: (text: string) => void;
  onCampaignStarted: () => void;
}

export default function BroadcastSender({
  selectedContactIds,
  messageText,
  onMessageChange,
  onCampaignStarted,
}: BroadcastSenderProps) {
  const [title, setTitle] = useState<string>('নতুন প্রচার ক্যাম্পেইন');
  const [delay, setDelay] = useState<number>(5);
  const [loading, setLoading] = useState<boolean>(false);
  const [openConfirm, setOpenConfirm] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const insertTag = (tag: string) => {
    onMessageChange(messageText + tag);
  };

  const handleStartBroadcast = async () => {
    if (selectedContactIds.length === 0) {
      setStatusMsg({ type: 'error', text: 'অনুগ্রহ করে প্রথমে কমপক্ষে একজন কন্টাক্ট সিলেক্ট করুন।' });
      return;
    }
    if (!messageText.trim()) {
      setStatusMsg({ type: 'error', text: 'মেসেজ কন্টেন্ট খালি রাখা যাবে না।' });
      return;
    }

    setOpenConfirm(false);
    setLoading(true);
    setStatusMsg(null);

    try {
      await BroadcastService.start({
        title: title.trim() || 'WhatsApp Broadcast',
        message_template: messageText.trim(),
        contact_ids: selectedContactIds,
        delay_seconds: delay,
      });

      setStatusMsg({
        type: 'success',
        text: `ক্যাম্পেইন সফলভাবে চালু হয়েছে! ব্যাকগ্রাউন্ডে ${selectedContactIds.length} জনের কাছে প্রতি ${delay} সেকেন্ড ব্যবধানে মেসেজ পাঠানো হচ্ছে।`,
      });
      onCampaignStarted();
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.response?.data?.detail || err.message || 'ক্যাম্পেইন শুরু করতে সমস্যা হয়েছে।',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ mb: 3, borderTop: '4px solid #128C7E' }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2, gap: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <SendIcon color="secondary" /> বাল্ক মেসেজ সেন্ডার (Broadcast)
            </Typography>
            <Typography variant="body2" color="text.secondary">
              একসাথে একাধিক ব্যবহারকারীর কাছে মেসেজ পাঠানোর কনসোল।
            </Typography>
          </Box>
          <Chip
            label={`${selectedContactIds.length} জন প্রাপক নির্বাচিত`}
            color={selectedContactIds.length > 0 ? 'primary' : 'default'}
            sx={{ fontWeight: 700, fontSize: '0.9rem' }}
          />
        </Stack>

        {statusMsg && (
          <Alert severity={statusMsg.type} sx={{ mb: 2 }} onClose={() => setStatusMsg(null)}>
            {statusMsg.text}
          </Alert>
        )}

        <Stack spacing={2.5}>
          <TextField
            label="ক্যাম্পেইন টাইটেল / নাম *"
            size="small"
            fullWidth
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Box>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                ডায়নামিক ভ্যারিয়েবল ট্যাগ (ক্লিক করে মেসেজে ইনসার্ট করুন):
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Chip
                label="{name} (গ্রাহকের নাম)"
                size="small"
                onClick={() => insertTag('{name}')}
                clickable
                color="secondary"
                variant="outlined"
              />
              <Chip
                label="{phone} (গ্রাহকের ফোন)"
                size="small"
                onClick={() => insertTag('{phone}')}
                clickable
                color="secondary"
                variant="outlined"
              />
            </Stack>
          </Box>

          <TextField
            label="মেসেজ কন্টেন্ট *"
            fullWidth
            multiline
            rows={5}
            value={messageText}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="আসসালামু আলাইকুম {name} ভাই! আমাদের নতুন অফার দেখতে ভিজিট করুন..."
            helperText="মেসেজের ভেতরে {name} থাকলে স্বয়ংক্রিয়ভাবে গ্রাহকের নাম দিয়ে প্রতিস্থাপিত হবে।"
          />

          {/* Anti-Ban Delay Controller */}
          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
              <SecurityIcon color="success" fontSize="small" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                অ্যান্টি-ব্যান সুরক্ষা ডিলে: {delay} সেকেন্ড
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
              WhatsApp অ্যাকাউন্ট সুরক্ষিত রাখতে প্রতিটি মেসেজ পাঠানোর মাঝে নির্ধারিত সেকেন্ডের ব্যবধান রাখা হয়।
            </Typography>
            <Slider
              value={delay}
              min={3}
              max={25}
              step={1}
              valueLabelDisplay="auto"
              onChange={(_, val) => setDelay(val as number)}
              sx={{ color: '#128C7E' }}
            />
          </Box>

          {loading && <LinearProgress color="secondary" />}

          <Box sx={{ textAlign: 'right' }}>
            <Button
              variant="contained"
              size="large"
              color="primary"
              startIcon={<SendIcon />}
              onClick={() => setOpenConfirm(true)}
              disabled={loading || selectedContactIds.length === 0 || !messageText.trim()}
              sx={{ px: 4, py: 1.2, fontWeight: 700 }}
            >
              বাল্ক মেসেজ শুরু করুন ({selectedContactIds.length})
            </Button>
          </Box>
        </Stack>

        {/* Confirmation Modal */}
        <Dialog open={openConfirm} onClose={() => setOpenConfirm(false)}>
          <DialogTitle sx={{ fontWeight: 700 }}>আপনি কি নিশ্চিত?</DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 1.5 }}>
              আপনি <b>{selectedContactIds.length}</b> জন কন্টাক্টকে মেসেজ পাঠাতে যাচ্ছেন।
            </Typography>
            <Typography variant="body2" color="text.secondary">
              প্রতিটি মেসেজের ব্যবধান: <b>{delay} সেকেন্ড</b>। এটি ব্যাকগ্রাউন্ডে স্বয়ংক্রিয়ভাবে চলবে।
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenConfirm(false)}>বাতিল</Button>
            <Button variant="contained" color="primary" onClick={handleStartBroadcast}>
              হ্যাঁ, পাঠানো শুরু করুন
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
