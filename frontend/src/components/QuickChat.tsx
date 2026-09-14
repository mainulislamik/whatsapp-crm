'use client';

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Chip,
  Alert,
  Stack,
  CircularProgress,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import { WhatsAppService } from '@/lib/api';

export default function QuickChat() {
  const [phone, setPhone] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [attachedFile, setAttachedFile] = useState<{
    file: File;
    base64: string;
    type: 'image' | 'document';
    previewUrl?: string;
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert('ফাইলের সাইজ সর্বোচ্চ ২০MB হতে পারে।');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];
      const isImg = file.type.startsWith('image/');
      setAttachedFile({
        file,
        base64: base64Data,
        type: isImg ? 'image' : 'document',
        previewUrl: isImg ? (reader.result as string) : undefined,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!phone.trim()) {
      setStatus({ type: 'error', text: 'ফোন নম্বর প্রদান করুন।' });
      return;
    }
    if (!message.trim() && !attachedFile) {
      setStatus({ type: 'error', text: 'মেসেজ অথবা এটাচমেন্ট প্রদান করুন।' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await WhatsAppService.sendDirect({
        phone: phone.trim(),
        message: message.trim(),
        media_base64: attachedFile?.base64,
        media_type: attachedFile?.type,
        file_name: attachedFile?.file.name,
        mime_type: attachedFile?.file.type,
      });

      setStatus({
        type: 'success',
        text: `মেসেজ সফলভাবে পাঠানো হয়েছে! (Message ID: ${res.data.messageId || 'OK'})`,
      });
      setMessage('');
      setAttachedFile(null);
    } catch (err: any) {
      setStatus({
        type: 'error',
        text: err.response?.data?.detail || err.message || 'মেসেজ পাঠাতে সমস্যা হয়েছে।',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ mb: 3, borderLeft: '6px solid #128C7E' }}>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <ChatIcon color="secondary" /> সরাসরি কুইক মেসেজ (Single Direct Send)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          যেকোনো নির্দিষ্ট নম্বরে তাৎক্ষণিক মেসেজ বা ফাইল পাঠাতে এটি ব্যবহার করুন।
        </Typography>

        {status && (
          <Alert severity={status.type} sx={{ mb: 2 }} onClose={() => setStatus(null)}>
            {status.text}
          </Alert>
        )}

        <Stack spacing={2}>
          <TextField
            label="প্রাপকের ফোন নম্বর *"
            placeholder="01712345678 বা 88017..."
            size="small"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
          />

          <TextField
            label="মেসেজ কন্টেন্ট"
            placeholder="আপনার মেসেজ লিখুন..."
            multiline
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            fullWidth
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button
                component="label"
                variant="outlined"
                size="small"
                startIcon={<AttachFileIcon />}
              >
                ফাইল / ছবি
                <input
                  type="file"
                  hidden
                  accept="image/*,.pdf,.doc,.docx,.xlsx"
                  onChange={handleFileUpload}
                />
              </Button>
              {attachedFile && (
                <Chip
                  label={attachedFile.file.name}
                  onDelete={() => setAttachedFile(null)}
                  deleteIcon={<CloseIcon />}
                  color="primary"
                  variant="outlined"
                  size="small"
                />
              )}
            </Stack>

            <Button
              variant="contained"
              color="primary"
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
              onClick={handleSend}
              disabled={loading || !phone.trim() || (!message.trim() && !attachedFile)}
              sx={{ px: 3, fontWeight: 700 }}
            >
              মেসেজ পাঠান
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
