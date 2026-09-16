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
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Divider,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import HighQualityIcon from '@mui/icons-material/HighQuality';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ImageIcon from '@mui/icons-material/Image';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { WhatsAppService, TemplateService, Template } from '@/lib/api';

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

  // Template Library Integration
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState<boolean>(false);
  const [openTemplateModal, setOpenTemplateModal] = useState<boolean>(false);

  const [deliveryMode, setDeliveryMode] = useState<'image' | 'document'>('image');
  const [attachedFile, setAttachedFile] = useState<{
    file?: File;
    fileName: string;
    base64: string;
    type: 'image' | 'document';
    mimeType?: string;
    previewUrl?: string;
    sizeFormatted?: string;
  } | null>(null);

  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await TemplateService.list();
      setTemplates(res.data || []);
    } catch (err: any) {
      console.error('Failed to load templates in QuickChat:', err);
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

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
        fileName: file.name,
        base64: base64Data,
        type: isImg ? 'image' : 'document',
        mimeType: file.type || (isImg ? 'image/jpeg' : 'application/octet-stream'),
        previewUrl: isImg ? (reader.result as string) : undefined,
        sizeFormatted: formatFileSize(file.size),
      });
      setDeliveryMode(isImg ? 'image' : 'document');
    };
    reader.readAsDataURL(file);
  };

  const handleSelectTemplate = (t: Template) => {
    // Process message content
    let appliedText = t.content || '';
    if (phone.trim()) {
      appliedText = appliedText.replace(/{phone}/g, phone.trim());
    }

    setMessage(appliedText);

    // If template has attached media, load it automatically
    if (t.media_base64) {
      const isImg = t.media_type === 'image' || t.mime_type?.startsWith('image/');
      setAttachedFile({
        fileName: t.file_name || (isImg ? 'template_photo.png' : 'template_doc.pdf'),
        base64: t.media_base64,
        type: isImg ? 'image' : 'document',
        mimeType: t.mime_type || (isImg ? 'image/jpeg' : 'application/octet-stream'),
        previewUrl: isImg ? `data:${t.mime_type || 'image/jpeg'};base64,${t.media_base64}` : undefined,
        sizeFormatted: 'Template Media',
      });
      setDeliveryMode(isImg ? 'image' : 'document');
    }

    setOpenTemplateModal(false);
    setStatus({
      type: 'success',
      text: `Applied template "${t.name}"${t.media_base64 ? ' with attached photo' : ''}!`,
    });
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
        file_name: attachedFile?.fileName || attachedFile?.file?.name,
        mime_type: attachedFile?.mimeType || attachedFile?.file?.type,
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
            Send instant high-resolution photos, documents, and messages directly using pre-made templates or custom content.
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
            {/* Phone Number Input */}
            <TextField
              label="Recipient Phone Number *"
              placeholder="e.g. 01712345678 or 88018..."
              size="small"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* Template Selector Bar */}
            <Box
              sx={{
                p: 1.5,
                bgcolor: '#f8fafc',
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AutoAwesomeIcon sx={{ color: '#0284c7', fontSize: 20 }} />
                <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1e293b' }}>
                  Message Templates:
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                {templates.slice(0, 3).map((t) => (
                  <Chip
                    key={t.id}
                    label={t.name}
                    icon={t.media_base64 ? <ImageIcon sx={{ fontSize: '14px !important' }} /> : undefined}
                    onClick={() => handleSelectTemplate(t)}
                    clickable
                    size="small"
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      '&:hover': { bgcolor: '#e0f2fe', borderColor: '#0284c7' },
                    }}
                  />
                ))}

                <Button
                  size="small"
                  variant="contained"
                  startIcon={<BookmarkBorderIcon />}
                  onClick={() => setOpenTemplateModal(true)}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    bgcolor: '#0284c7',
                    '&:hover': { bgcolor: '#0369a1' },
                    borderRadius: 1.5,
                    px: 1.5,
                  }}
                >
                  Select / Browse Templates ({templates.length})
                </Button>
              </Stack>
            </Box>

            {/* Message Text Input */}
            <TextField
              label="Message Caption / Content"
              placeholder="Type your WhatsApp message, select a template, or write an image caption here..."
              multiline
              rows={4}
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
                      {attachedFile.mimeType?.includes('pdf') || attachedFile.file?.type?.includes('pdf') ? (
                        <PictureAsPdfIcon />
                      ) : (
                        <InsertDriveFileIcon />
                      )}
                    </Avatar>
                  )}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }} noWrap>
                      {attachedFile.fileName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      {attachedFile.sizeFormatted || 'Attachment ready'} • {attachedFile.type === 'image' ? 'Image File' : 'Document File'}
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

      {/* Template Selection Modal */}
      <Dialog open={openTemplateModal} onClose={() => setOpenTemplateModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BookmarkBorderIcon sx={{ color: '#0284c7' }} /> Select Message Template
          </Box>
          <IconButton size="small" onClick={() => setOpenTemplateModal(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ py: 2 }}>
          {templatesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : templates.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, bgcolor: '#f8fafc', borderRadius: 2 }}>
              <Typography variant="body1" fontWeight={600} color="text.secondary">
                No templates found
              </Typography>
              <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
                Please create templates in the Message Template Library first.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              {templates.map((t) => {
                const hasMedia = Boolean(t.media_base64);
                const isImg = t.media_type === 'image' || t.mime_type?.startsWith('image/');
                const previewSrc = hasMedia && isImg ? `data:${t.mime_type || 'image/jpeg'};base64,${t.media_base64}` : null;

                return (
                  <Paper
                    key={t.id}
                    variant="outlined"
                    onClick={() => handleSelectTemplate(t)}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      cursor: 'pointer',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      '&:hover': {
                        borderColor: '#0284c7',
                        bgcolor: '#f0f9ff',
                        boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)',
                      },
                    }}
                  >
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a' }}>
                          {t.name}
                        </Typography>
                        <Stack direction="row" spacing={0.5}>
                          <Chip
                            label={t.category || 'General'}
                            size="small"
                            sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600, bgcolor: '#e0f2fe', color: '#0369a1' }}
                          />
                          {hasMedia && (
                            <Chip
                              icon={<ImageIcon sx={{ fontSize: '12px !important' }} />}
                              label="Photo"
                              size="small"
                              sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600, bgcolor: '#fef3c7', color: '#92400e' }}
                            />
                          )}
                        </Stack>
                      </Box>

                      {hasMedia && previewSrc && (
                        <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            component="img"
                            src={previewSrc}
                            alt="Template Preview"
                            sx={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 1, border: '1px solid #cbd5e1' }}
                          />
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                            {t.file_name || 'Attached Photo'}
                          </Typography>
                        </Box>
                      )}

                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          fontSize: '0.8rem',
                          lineHeight: 1.4,
                          whiteSpace: 'pre-wrap',
                          maxHeight: 80,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          bgcolor: '#ffffff',
                          p: 1,
                          borderRadius: 1,
                          border: '1px solid #f1f5f9',
                        }}
                      >
                        {t.content || '(Media only)'}
                      </Typography>
                    </Box>

                    <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                        sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.75rem', color: '#0284c7' }}
                      >
                        Apply Template
                      </Button>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setOpenTemplateModal(false)} sx={{ textTransform: 'none', color: '#64748b' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Image Preview Lightbox Modal */}
      <Dialog open={Boolean(previewModalImg)} onClose={() => setPreviewModalImg(null)} maxWidth="md">
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
