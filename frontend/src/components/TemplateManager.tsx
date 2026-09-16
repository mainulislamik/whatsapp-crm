'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  Paper,
  Stack,
  RadioGroup,
  FormControlLabel,
  Radio,
  Avatar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import VideocamIcon from '@mui/icons-material/Videocam';
import CloseIcon from '@mui/icons-material/Close';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CategoryIcon from '@mui/icons-material/Category';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import HighQualityIcon from '@mui/icons-material/HighQuality';
import ImageIcon from '@mui/icons-material/Image';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SendIcon from '@mui/icons-material/Send';
import { TemplateService, Template } from '@/lib/api';

const DYNAMIC_VARIABLES = [
  { tag: '{name}', label: 'Lead / Contact Name' },
  { tag: '{phone}', label: 'Phone Number' },
  { tag: '{email}', label: 'Email Address' },
  { tag: '{website}', label: 'Website URL' },
];

const CATEGORIES = ['General', 'Promotional', 'Follow-up', 'Greeting', 'Transactional', 'Offer'];

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.3gp', '.m4v', '.wmv', '.flv', '.ts'];

const isVideoFile = (type?: string | null, fileName?: string | null) => {
  if (type && (type.startsWith('video/') || type === 'video')) return true;
  if (fileName) {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    return VIDEO_EXTENSIONS.includes(ext);
  }
  return false;
};

const isImageFile = (type?: string | null, fileName?: string | null) => {
  if (type && (type.startsWith('image/') || type === 'image')) return true;
  if (fileName) {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
  }
  return false;
};

interface TemplateManagerProps {
  onSelectTemplate?: (content: string, media?: any) => void;
}

export default function TemplateManager({ onSelectTemplate }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dialog states
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Form states
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [content, setContent] = useState<string>('');
  const [mediaFile, setMediaFile] = useState<{
    file?: File;
    fileName: string;
    base64: string;
    type: 'image' | 'video' | 'document';
    mimeType?: string;
    previewUrl?: string;
    sizeFormatted?: string;
  } | null>(null);

  const [saving, setSaving] = useState<boolean>(false);
  const [previewMediaModal, setPreviewMediaModal] = useState<{ url: string; type: 'image' | 'video'; title?: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await TemplateService.list();
      setTemplates(res.data || []);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
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

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName('');
    setCategory('General');
    setContent('');
    setMediaFile(null);
    setError(null);
    setOpenModal(true);
  };

  const handleOpenEdit = (t: Template) => {
    setEditingTemplate(t);
    setName(t.name);
    setCategory(t.category || 'General');
    setContent(t.content || '');

    if (t.media_base64) {
      const isVid = isVideoFile(t.media_type, t.file_name) || t.mime_type?.startsWith('video/');
      const isImg = !isVid && (isImageFile(t.media_type, t.file_name) || t.mime_type?.startsWith('image/'));
      const determinedType: 'image' | 'video' | 'document' = isVid ? 'video' : isImg ? 'image' : 'document';
      const determinedMime = t.mime_type || (isVid ? 'video/mp4' : isImg ? 'image/jpeg' : 'application/octet-stream');

      setMediaFile({
        fileName: t.file_name || (isVid ? 'attached_video.mp4' : isImg ? 'attached_image.png' : 'attached_doc.pdf'),
        base64: t.media_base64,
        type: determinedType,
        mimeType: determinedMime,
        previewUrl: (isImg || isVid) ? `data:${determinedMime};base64,${t.media_base64}` : undefined,
        sizeFormatted: 'Attached Media',
      });
    } else {
      setMediaFile(null);
    }

    setError(null);
    setOpenModal(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, preferredType?: 'image' | 'video' | 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
    if (file.size > MAX_SIZE_BYTES) {
      alert(`Maximum file upload size is 100MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];
      const isVid = preferredType === 'video' || isVideoFile(file.type, file.name);
      const isImg = !isVid && (preferredType === 'image' || isImageFile(file.type, file.name));
      const fileType: 'image' | 'video' | 'document' = isVid ? 'video' : isImg ? 'image' : 'document';

      setMediaFile({
        file,
        fileName: file.name,
        base64: base64Data,
        type: fileType,
        mimeType: file.type || (isVid ? 'video/mp4' : isImg ? 'image/jpeg' : 'application/octet-stream'),
        previewUrl: (isImg || isVid) ? (reader.result as string) : undefined,
        sizeFormatted: formatFileSize(file.size),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleInsertTag = (tag: string) => {
    setContent((prev) => prev + ' ' + tag);
  };

  const handleApplyToBroadcast = (t: Template) => {
    if (onSelectTemplate) {
      let mediaPayload = null;
      if (t.media_base64) {
        mediaPayload = {
          base64: t.media_base64,
          type: t.media_type || (isVideoFile(t.media_type, t.file_name) ? 'video' : 'image'),
          fileName: t.file_name || 'template_media',
          mimeType: t.mime_type,
        };
      }
      onSelectTemplate(t.content || '', mediaPayload);
      setSuccess(`Applied "${t.name}" to broadcast sender!`);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    if (!content.trim() && !mediaFile) {
      setError('Either message text or an attached file is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        category: category.trim(),
        content: content.trim(),
        media_base64: mediaFile ? mediaFile.base64 : '',
        media_type: mediaFile ? mediaFile.type : '',
        file_name: mediaFile ? mediaFile.fileName : '',
        mime_type: mediaFile ? mediaFile.mimeType : '',
      };

      if (editingTemplate?.id) {
        await TemplateService.update(editingTemplate.id, payload);
        setSuccess(`Template "${name}" updated successfully!`);
      } else {
        await TemplateService.create(payload);
        setSuccess(`Template "${name}" created successfully!`);
      }

      setOpenModal(false);
      await loadTemplates();
    } catch (err: any) {
      console.error('Failed to save template:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await TemplateService.delete(id);
      setSuccess('Template deleted successfully.');
      setDeleteConfirmId(null);
      await loadTemplates();
    } catch (err: any) {
      console.error('Failed to delete template:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to delete template');
    }
  };

  const handleDuplicate = async (t: Template) => {
    try {
      await TemplateService.create({
        name: `${t.name} (Copy)`,
        category: t.category || 'General',
        content: t.content || '',
        media_base64: t.media_base64 || '',
        media_type: t.media_type || '',
        file_name: t.file_name || '',
        mime_type: t.mime_type || '',
      });
      setSuccess(`Duplicated template as "${t.name} (Copy)"!`);
      await loadTemplates();
    } catch (err: any) {
      setError('Failed to duplicate template');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header Bar */}
      <Card
        sx={{
          borderRadius: 3,
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 2,
            }}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <BookmarkBorderIcon sx={{ color: '#0284c7', fontSize: 28 }} /> Message Template Library
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Manage reusable messaging templates with support for dynamic tags, high-res photos, 100MB video files, and documents.
              </Typography>
            </Box>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
              sx={{
                borderRadius: 2,
                px: 2.5,
                py: 1,
                fontWeight: 700,
                textTransform: 'none',
                bgcolor: '#0284c7',
                '&:hover': { bgcolor: '#0369a1' },
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
              }}
            >
              Create New Template
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Notifications */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ borderRadius: 2 }}>
          {success}
        </Alert>
      )}

      {/* Templates Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={40} />
        </Box>
      ) : templates.length === 0 ? (
        <Card sx={{ borderRadius: 3, p: 6, textAlign: 'center', border: '1px dashed #cbd5e1', bgcolor: '#f8fafc' }}>
          <BookmarkBorderIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1.5 }} />
          <Typography variant="h6" fontWeight={700} color="#334155">
            No Templates Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mt: 0.5, mb: 2.5 }}>
            Create reusable templates with customized messages, videos (up to 100MB), photos, and documents for fast single and bulk broadcasting.
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate} sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#0284c7' }}>
            Create First Template
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2.5 }}>
          {templates.map((t) => {
            const hasMedia = Boolean(t.media_base64);
            const isVideo = isVideoFile(t.media_type, t.file_name) || t.mime_type?.startsWith('video/');
            const isImg = !isVideo && (isImageFile(t.media_type, t.file_name) || t.mime_type?.startsWith('image/'));
            const isDoc = hasMedia && !isImg && !isVideo;
            const previewSrc = hasMedia && (isImg || isVideo) ? `data:${t.mime_type || (isVideo ? 'video/mp4' : 'image/jpeg')};base64,${t.media_base64}` : null;

            return (
              <Card
                key={t.id}
                sx={{
                  borderRadius: 3,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s',
                  '&:hover': {
                    borderColor: '#0284c7',
                    boxShadow: '0 8px 24px rgba(2, 132, 199, 0.12)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  {/* Top Bar: Title & Category */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Typography variant="h6" fontWeight={800} sx={{ color: '#0f172a', fontSize: '1.05rem', pr: 1 }}>
                      {t.name}
                    </Typography>
                    <Chip
                      label={t.category || 'General'}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        bgcolor: '#e0f2fe',
                        color: '#0369a1',
                        border: '1px solid #bae6fd',
                        height: 22,
                        fontSize: '0.72rem',
                      }}
                    />
                  </Box>

                  {/* Media Banner / Thumbnail */}
                  {hasMedia && (
                    <Box
                      sx={{
                        mb: 2,
                        p: 1.2,
                        bgcolor: '#f8fafc',
                        borderRadius: 2,
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden' }}>
                        {isVideo && previewSrc ? (
                          <Box
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: 1.5,
                              bgcolor: '#1e1b4b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              border: '1px solid #818cf8',
                              flexShrink: 0,
                            }}
                            onClick={() => setPreviewMediaModal({ url: previewSrc, type: 'video', title: t.file_name || t.name })}
                          >
                            <PlayCircleOutlineIcon sx={{ color: '#c7d2fe', fontSize: 26 }} />
                          </Box>
                        ) : isImg && previewSrc ? (
                          <Avatar
                            src={previewSrc}
                            variant="rounded"
                            sx={{ width: 48, height: 48, border: '1px solid #cbd5e1', cursor: 'pointer', flexShrink: 0 }}
                            onClick={() => setPreviewMediaModal({ url: previewSrc, type: 'image', title: t.file_name || t.name })}
                          />
                        ) : (
                          <Avatar variant="rounded" sx={{ width: 48, height: 48, bgcolor: '#e0f2fe', color: '#0284c7', flexShrink: 0 }}>
                            <PictureAsPdfIcon />
                          </Avatar>
                        )}
                        <Box sx={{ overflow: 'hidden' }}>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#1e293b' }} noWrap>
                            {t.file_name || (isVideo ? 'Video Clip' : isImg ? 'Photo' : 'Document')}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            {isVideo ? '🎬 100MB Video Clip' : isImg ? '📷 High-Res Photo' : '📄 Document'}
                          </Typography>
                        </Box>
                      </Box>

                      <Chip
                        icon={
                          isVideo ? (
                            <VideocamIcon sx={{ fontSize: '13px !important' }} />
                          ) : isImg ? (
                            <ImageIcon sx={{ fontSize: '13px !important' }} />
                          ) : (
                            <AttachFileIcon sx={{ fontSize: '13px !important' }} />
                          )
                        }
                        label={isVideo ? 'Video' : isImg ? 'Photo' : 'Doc'}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          bgcolor: isVideo ? '#f5f3ff' : isImg ? '#fef3c7' : '#ecfdf5',
                          color: isVideo ? '#7c3aed' : isImg ? '#92400e' : '#059669',
                        }}
                      />
                    </Box>
                  )}

                  {/* Message Content Preview */}
                  <Typography
                    variant="body2"
                    sx={{
                      color: '#475569',
                      whiteSpace: 'pre-wrap',
                      bgcolor: '#f8fafc',
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid #f1f5f9',
                      fontSize: '0.85rem',
                      lineHeight: 1.5,
                      maxHeight: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {t.content || '(Media attachment only — no text body)'}
                  </Typography>
                </CardContent>

                {/* Card Actions */}
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    bgcolor: '#fafafa',
                    borderTop: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Tooltip title="Duplicate Template">
                    <IconButton size="small" onClick={() => handleDuplicate(t)} sx={{ color: '#64748b' }}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>

                  <Stack direction="row" spacing={1}>
                    {onSelectTemplate && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<SendIcon sx={{ fontSize: '14px !important' }} />}
                        onClick={() => handleApplyToBroadcast(t)}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          borderRadius: 1.5,
                          bgcolor: '#10b981',
                          '&:hover': { bgcolor: '#059669' },
                        }}
                      >
                        Use
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      onClick={() => handleOpenEdit(t)}
                      sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 1.5, borderColor: '#cbd5e1', color: '#334155' }}
                    >
                      Edit
                    </Button>
                    <IconButton
                      size="small"
                      onClick={() => setDeleteConfirmId(t.id)}
                      sx={{ color: '#ef4444', '&:hover': { bgcolor: '#fef2f2' } }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Create / Edit Template Dialog */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BookmarkBorderIcon sx={{ color: '#0284c7' }} />
            {editingTemplate ? `Edit Template: ${editingTemplate.name}` : 'Create Message Template'}
          </Box>
          <IconButton size="small" onClick={() => setOpenModal(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ py: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Template Name & Category */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 2 }}>
              <TextField
                label="Template Name *"
                placeholder="e.g. Eid Mega Offer 2026, Welcome Greeting..."
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />

              <TextField
                select
                label="Category"
                size="small"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                SelectProps={{ native: true }}
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </TextField>
            </Box>

            {/* Dynamic Tags Toolbar */}
            <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: '#475569', display: 'block', mb: 1 }}>
                Click to Insert Dynamic Variables:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {DYNAMIC_VARIABLES.map((v) => (
                  <Chip
                    key={v.tag}
                    label={`${v.tag} (${v.label})`}
                    onClick={() => handleInsertTag(v.tag)}
                    clickable
                    size="small"
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#e0f2fe',
                      color: '#0369a1',
                      border: '1px solid #bae6fd',
                      '&:hover': { bgcolor: '#bae6fd' },
                    }}
                  />
                ))}
              </Stack>
            </Box>

            {/* Message Body */}
            <TextField
              label="Message Body / Caption"
              placeholder="Write your template text here. You can include Bengali, emojis, links, and tags like {name}, {phone}..."
              multiline
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            {/* Attached Media Box */}
            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px solid #cbd5e1' }}>
              <Typography variant="subtitle2" fontWeight={800} sx={{ color: '#0f172a', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AttachFileIcon sx={{ color: '#0284c7' }} /> Attached Media / Video / Photo / Document (Optional)
              </Typography>

              {mediaFile ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
                    {mediaFile.type === 'video' && mediaFile.previewUrl ? (
                      <Box
                        component="video"
                        src={mediaFile.previewUrl}
                        controls
                        sx={{ width: 100, height: 60, borderRadius: 1.5, border: '1px solid #cbd5e1', bgcolor: '#000', flexShrink: 0 }}
                      />
                    ) : mediaFile.type === 'image' && mediaFile.previewUrl ? (
                      <Avatar
                        src={mediaFile.previewUrl}
                        variant="rounded"
                        sx={{ width: 60, height: 60, border: '1px solid #cbd5e1', cursor: 'pointer', flexShrink: 0 }}
                        onClick={() => setPreviewMediaModal({ url: mediaFile.previewUrl!, type: 'image', title: mediaFile.fileName })}
                      />
                    ) : (
                      <Avatar variant="rounded" sx={{ width: 60, height: 60, bgcolor: '#e0f2fe', color: '#0284c7', flexShrink: 0 }}>
                        <PictureAsPdfIcon />
                      </Avatar>
                    )}
                    <Box sx={{ overflow: 'hidden' }}>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#0f172a' }} noWrap>
                        {mediaFile.fileName}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        {mediaFile.sizeFormatted || 'Attachment ready'} • {mediaFile.type === 'video' ? '🎬 Video (Max 100MB)' : mediaFile.type === 'image' ? '📷 High-Res Photo' : '📄 Document'}
                      </Typography>
                    </Box>
                  </Box>

                  <IconButton size="small" onClick={() => setMediaFile(null)} sx={{ color: '#ef4444' }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ) : (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
                  {/* Attach Video Button */}
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<VideocamIcon sx={{ color: '#7c3aed' }} />}
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: '#c4b5fd',
                      bgcolor: '#faf5ff',
                      color: '#6d28d9',
                      '&:hover': { bgcolor: '#f3e8ff', borderColor: '#7c3aed' },
                    }}
                  >
                    Attach Video (Max 100MB)
                    <input
                      type="file"
                      hidden
                      accept="video/*,.mp4,.mkv,.avi,.mov,.webm,.3gp,.m4v,.wmv,.flv,.ts"
                      onChange={(e) => handleFileUpload(e, 'video')}
                    />
                  </Button>

                  {/* Attach Photo Button */}
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<AddPhotoAlternateIcon sx={{ color: '#d97706' }} />}
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: '#fde68a',
                      bgcolor: '#fffbeb',
                      color: '#b45309',
                      '&:hover': { bgcolor: '#fef3c7', borderColor: '#d97706' },
                    }}
                  >
                    Attach Photo / Image
                    <input
                      type="file"
                      hidden
                      accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                      onChange={(e) => handleFileUpload(e, 'image')}
                    />
                  </Button>

                  {/* Attach Document Button */}
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<AttachFileIcon sx={{ color: '#059669' }} />}
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: '#a7f3d0',
                      bgcolor: '#ecfdf5',
                      color: '#047857',
                      '&:hover': { bgcolor: '#d1fae5', borderColor: '#059669' },
                    }}
                  >
                    Attach Document
                    <input
                      type="file"
                      hidden
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      onChange={(e) => handleFileUpload(e, 'document')}
                    />
                  </Button>
                </Stack>
              )}

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                Supported formats: <strong>All Video files (MP4, MKV, AVI, MOV, 3GP, WEBM, M4V, etc.)</strong>, Photos (JPG, PNG, WEBP), Documents (PDF, DOCX) — <strong>Max Upload: 100MB</strong>.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenModal(false)} sx={{ textTransform: 'none', color: '#64748b' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !name.trim() || (!content.trim() && !mediaFile)}
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
            sx={{
              borderRadius: 2,
              px: 3,
              fontWeight: 700,
              textTransform: 'none',
              bgcolor: '#0284c7',
              '&:hover': { bgcolor: '#0369a1' },
            }}
          >
            {editingTemplate ? 'Update Template' : 'Save Template'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteConfirmId)} onClose={() => setDeleteConfirmId(null)}>
        <DialogTitle sx={{ fontWeight: 700, color: '#ef4444' }}>Delete Template?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete this template? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteConfirmId(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Media Lightbox Modal */}
      <Dialog open={Boolean(previewMediaModal)} onClose={() => setPreviewMediaModal(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {previewMediaModal?.title || 'Media Preview'}
          </Typography>
          <IconButton size="small" onClick={() => setPreviewMediaModal(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 2, bgcolor: '#000000', display: 'flex', justifyContent: 'center' }}>
          {previewMediaModal?.type === 'video' ? (
            <video
              src={previewMediaModal.url}
              controls
              autoPlay
              style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: 8 }}
            />
          ) : previewMediaModal?.url ? (
            <img
              src={previewMediaModal.url}
              alt="Media Preview"
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
