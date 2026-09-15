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

interface QuickChatProps {
  initialPhone?: string;
}

export default function QuickChat({ initialPhone = '' }: QuickChatProps) {
  const [phone, setPhone] = useState<string>(initialPhone);

  React.useEffect(() => {
    if (initialPhone) {
      setPhone(initialPhone);
    }
  }, [initialPhone]);
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
      alert('Maximum file size is 20MB.');
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
      setStatus({ type: 'error', text: 'Recipient phone number is required.' });
      return;
    }
    if (!message.trim() && !attachedFile) {
      setStatus({ type: 'error', text: 'Message text or attachment is required.' });
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
        text: `Message sent successfully! (ID: ${res.data.messageId || 'OK'})`,
      });
      setMessage('');
      setAttachedFile(null);
    } catch (err: any) {
      setStatus({
        type: 'error',
        text: err.response?.data?.detail || err.message || 'Failed to send message.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ mb: 3, borderLeft: '6px solid #128C7E' }}>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <ChatIcon color="secondary" /> Direct Quick Message (1-to-1 Send)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Send an instant text message or media file directly to any WhatsApp phone number.
        </Typography>

        {status && (
          <Alert severity={status.type} sx={{ mb: 2 }} onClose={() => setStatus(null)}>
            {status.text}
          </Alert>
        )}

        <Stack spacing={2}>
          <TextField
            label="Recipient Phone Number *"
            placeholder="e.g. 01712345678 or 88017..."
            size="small"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
          />

          <TextField
            label="Message Content"
            placeholder="Type your message here..."
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
                Attach File / Image
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
              Send Message
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
