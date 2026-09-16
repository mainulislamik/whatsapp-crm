'use client';

import React, { useState, useEffect } from 'react';
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
  Paper,
  Avatar,
  RadioGroup,
  FormControlLabel,
  Radio,
  IconButton,
  Dialog,
  DialogContent,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import HighQualityIcon from '@mui/icons-material/HighQuality';
import { WhatsAppService } from '@/lib/api';

interface QuickChatProps {
  initialPhone?: string;
  onOpenLiveChat?: (phone: string) => void;
}

export default function QuickChat({ initialPhone = '', onOpenLiveChat }: QuickChatProps) {
  const [phone, setPhone] = useState<string>(initialPhone);

  useEffect(() => {
    if (initialPhone) {
      setPhone(initialPhone);
    }
  }, [initialPhone]);

  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [deliveryMode, setDeliveryMode] = useState<'image' | 'document'>('image');
  const [attachedFile, setAttachedFile] = useState<{
    file: File;
    base64: string;
    type: 'image' | 'document';
    previewUrl?: string;
    sizeFormatted: string;
  } | null>(null);

  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('Maximum file size is 25MB.');
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
        sizeFormatted: formatFileSize(file.size),
      });
      setDeliveryMode(isImg ? 'image' : 'document');
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
        media_type: attachedFile ? (deliveryMode === 'document' ? 'document' : attachedFile.type) : undefined,
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1-to-1 Direct Send Card */}
      <Card
        sx={{
          borderRadius: 3,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
          borderLeft: '6px solid #10b981',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1.2, color: '#0f172a' }}>
              <ChatIcon sx={{ color: '#10b981' }} /> Direct Quick Message (1-to-1 Send)
            </Typography>
            <Chip
              label="Stateless Direct Dispatch"
              size="small"
              sx={{ bgcolor: '#ecfdf5', color: '#059669', fontWeight: 700, border: '1px solid #a7f3d0' }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Send instant high-resolution photos, documents, and messages directly without storing any media files or chat logs on the server.
          </Typography>

          {status && (
            <Alert
              severity={status.type}
              sx={{ mb: 2.5, borderRadius: 2, fontWeight: 600 }}
              onClose={() => setStatus(null)}
            >
              {status.text}
            </Alert>
          )}

          <Stack spacing={2.5}>
            <TextField
              label="Recipient Phone Number *"
              placeholder="e.g. 01712345678 or 88018..."
              size="small"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <TextField
              label="Message Caption / Content"
              placeholder="Type your WhatsApp message or image caption here..."
              multiline
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* Attached Media Preview Box */}
            {attachedFile && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  bgcolor: '#f8fafc',
                  borderColor: '#cbd5e1',
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { sm: 'center' },
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {attachedFile.previewUrl ? (
                    <Avatar
                      src={attachedFile.previewUrl}
                      variant="rounded"
                      sx={{ width: 64, height: 64, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                      onClick={() => setPreviewModalImg(attachedFile.previewUrl || null)}
                    />
                  ) : (
                    <Avatar
                      variant="rounded"
                      sx={{ width: 64, height: 64, bgcolor: '#e0f2fe', color: '#0284c7' }}
                    >
                      {attachedFile.file.type.includes('pdf') ? <PictureAsPdfIcon /> : <InsertDriveFileIcon />}
                    </Avatar>
                  )}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }} noWrap>
                      {attachedFile.file.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      {attachedFile.sizeFormatted} • {attachedFile.file.type || 'Media file'}
                    </Typography>
                  </Box>
                </Box>

                {/* Quality Mode Toggle for Images */}
                {attachedFile.type === 'image' && (
                  <Box sx={{ bgcolor: '#ffffff', p: 1, px: 1.5, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', display: 'block', mb: 0.5 }}>
                      Delivery Format:
                    </Typography>
                    <RadioGroup
                      row
                      value={deliveryMode}
                      onChange={(e) => setDeliveryMode(e.target.value as any)}
                    >
                      <FormControlLabel
                        value="image"
                        control={<Radio size="small" />}
                        label={<Typography variant="caption" sx={{ fontWeight: 600 }}>Standard Photo</Typography>}
                      />
                      <FormControlLabel
                        value="document"
                        control={<Radio size="small" color="secondary" />}
                        label={
                          <Typography variant="caption" sx={{ fontWeight: 700, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                            <HighQualityIcon sx={{ fontSize: 16 }} /> 100% HD Quality (Document)
                          </Typography>
                        }
                      />
                    </RadioGroup>
                  </Box>
                )}

                <IconButton
                  size="small"
                  onClick={() => setAttachedFile(null)}
                  sx={{ color: '#ef4444', alignSelf: { xs: 'flex-end', sm: 'center' } }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Paper>
            )}

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1.5, pt: 1 }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Button
                  component="label"
                  variant="outlined"
                  size="medium"
                  startIcon={<AttachFileIcon />}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, borderColor: '#cbd5e1' }}
                >
                  {attachedFile ? 'Change Attachment' : 'Attach Photo / Document'}
                  <input
                    type="file"
                    hidden
                    accept="image/*,.pdf,.doc,.docx,.xlsx"
                    onChange={handleFileUpload}
                  />
                </Button>
              </Stack>

              <Button
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
                onClick={handleSend}
                disabled={loading || !phone.trim() || (!message.trim() && !attachedFile)}
                sx={{
                  px: 4,
                  py: 1.2,
                  fontWeight: 800,
                  borderRadius: 2,
                  textTransform: 'none',
                  bgcolor: '#10b981',
                  '&:hover': { bgcolor: '#059669' },
                }}
              >
                Send Message
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Image Preview Lightbox Modal */}
      <Dialog
        open={Boolean(previewModalImg)}
        onClose={() => setPreviewModalImg(null)}
        maxWidth="md"
      >
        <DialogContent sx={{ p: 1, bgcolor: '#000000', display: 'flex', justifyContent: 'center' }}>
          {previewModalImg && (
            <img
              src={previewModalImg}
              alt="Media Preview"
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}