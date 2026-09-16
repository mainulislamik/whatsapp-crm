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
  Stack,
  Alert,
  CircularProgress,
  Tooltip,
  Paper,
  InputAdornment,
  Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CloseIcon from '@mui/icons-material/Close';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SendIcon from '@mui/icons-material/Send';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Template, TemplateService } from '@/lib/api';

interface TemplateManagerProps {
  onSelectTemplate?: (content: string, media?: { base64: string; type: string; fileName: string; mimeType: string }) => void;
}

const PRESET_CATEGORIES = ['All', 'General', 'Promotional', 'Greeting', 'Support', 'Billing', 'Reminder'];

export default function TemplateManager({ onSelectTemplate }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [content, setContent] = useState('');
  
  // Attached Media State
  const [attachedMedia, setAttachedMedia] = useState<{
    base64: string;
    type: string;
    fileName: string;
    mimeType: string;
    previewUrl?: string;
    fileSize?: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await TemplateService.list();
      setTemplates(res.data || []);
    } catch (err: any) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName('');
    setCategory('General');
    setContent('');
    setAttachedMedia(null);
    setError(null);
    setOpenDialog(true);
  };

  const handleOpenEdit = (t: Template) => {
    setEditingTemplate(t);
    setName(t.name);
    setCategory(t.category || 'General');
    setContent(t.content || '');
    setError(null);
    if (t.media_base64) {
      setAttachedMedia({
        base64: t.media_base64,
        type: t.media_type || 'image',
        fileName: t.file_name || 'attached_file',
        mimeType: t.mime_type || 'image/jpeg',
        previewUrl: t.media_type === 'image' || t.mime_type?.startsWith('image/')
          ? `data:${t.mime_type || 'image/jpeg'};base64,${t.media_base64}`
          : undefined,
      });
    } else {
      setAttachedMedia(null);
    }
    setOpenDialog(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size <= 15MB
    if (file.size > 15 * 1024 * 1024) {
      setError('File size must be under 15MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(',')[1];
      const isImg = file.type.startsWith('image/');
      const sizeStr = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
        : `${(file.size / 1024).toFixed(0)} KB`;

      setAttachedMedia({
        base64: base64Data,
        type: isImg ? 'image' : 'document',
        fileName: file.name,
        mimeType: file.type || (isImg ? 'image/jpeg' : 'application/octet-stream'),
        previewUrl: isImg ? (reader.result as string) : undefined,
        fileSize: sizeStr,
      });
      setError(null);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        content: content.trim(),
        category: category.trim() || 'General',
        media_base64: attachedMedia?.base64 || null,
        media_type: attachedMedia?.type || null,
        file_name: attachedMedia?.fileName || null,
        mime_type: attachedMedia?.mimeType || null,
      };

      if (editingTemplate) {
        await TemplateService.update(editingTemplate.id, payload);
      } else {
        await TemplateService.create(payload as any);
      }

      setOpenDialog(false);
      loadTemplates();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await TemplateService.delete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err: any) {
      console.error('Failed to delete template:', err);
    }
  };

  const insertTag = (tag: string) => {
    setContent((prev) => `${prev} ${tag} `);
  };

  const handleUseTemplate = (t: Template) => {
    if (onSelectTemplate) {
      const media = t.media_base64
        ? {
            base64: t.media_base64,
            type: t.media_type || 'image',
            fileName: t.file_name || 'media',
            mimeType: t.mime_type || 'image/jpeg',
          }
        : undefined;
      onSelectTemplate(t.content, media);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesCat = selectedCategory === 'All' || t.category === selectedCategory;
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.category && t.category.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  return (
    <Card sx={{ border: '1px solid #e2e8f0', boxShadow: 'none', borderRadius: 2 }}>
      <CardContent sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
              Message Template Library
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pre-crafted message templates with text, dynamic tags, and attached photos/media.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{
              bgcolor: '#25D366',
              '&:hover': { bgcolor: '#128C7E' },
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 2.5,
            }}
          >
            Create Template
          </Button>
        </Box>

        {/* Search & Category Filter */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }} alignItems="center">
          <TextField
            size="small"
            placeholder="Search templates by name, content, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: { xs: '100%', sm: 300 } }}
          />

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: '100%' }}>
            {PRESET_CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                clickable
                onClick={() => setSelectedCategory(cat)}
                sx={{
                  bgcolor: selectedCategory === cat ? '#0f172a' : '#f1f5f9',
                  color: selectedCategory === cat ? '#fff' : '#475569',
                  fontWeight: selectedCategory === cat ? 600 : 400,
                  '&:hover': {
                    bgcolor: selectedCategory === cat ? '#1e293b' : '#e2e8f0',
                  },
                }}
              />
            ))}
          </Box>
        </Stack>

        {/* Templates Grid */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} sx={{ color: '#25D366' }} />
          </Box>
        ) : filteredTemplates.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, bgcolor: '#f8fafc', borderRadius: 2, border: '1px dashed #cbd5e1' }}>
            <Typography variant="body1" fontWeight={600} color="text.secondary">
              No templates found
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              Click "Create Template" to create a new template with text and photos.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {filteredTemplates.map((t) => {
              const hasMedia = Boolean(t.media_base64);
              const isImage = t.media_type === 'image' || t.mime_type?.startsWith('image/');
              const previewSrc = hasMedia && isImage ? `data:${t.mime_type || 'image/jpeg'};base64,${t.media_base64}` : null;

              return (
                <Paper
                  key={t.id}
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    borderRadius: 2,
                    borderColor: '#e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      borderColor: '#cbd5e1',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                    },
                  }}
                >
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                      <Box sx={{ pr: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#0f172a', lineHeight: 1.3 }}>
                          {t.name}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} alignItems="center">
                          <Chip
                            label={t.category || 'General'}
                            size="small"
                            sx={{
                              fontSize: '0.72rem',
                              height: 22,
                              fontWeight: 600,
                              bgcolor: '#e0f2fe',
                              color: '#0369a1',
                            }}
                          />
                          {hasMedia && (
                            <Chip
                              icon={isImage ? <ImageIcon sx={{ fontSize: '14px !important' }} /> : <InsertDriveFileIcon sx={{ fontSize: '14px !important' }} />}
                              label={isImage ? 'Photo' : 'Document'}
                              size="small"
                              sx={{
                                fontSize: '0.72rem',
                                height: 22,
                                fontWeight: 600,
                                bgcolor: '#fef3c7',
                                color: '#92400e',
                              }}
                            />
                          )}
                        </Stack>
                      </Box>

                      <Stack direction="row" spacing={0.5}>
                        <Tooltip title="Edit template">
                          <IconButton size="small" onClick={() => handleOpenEdit(t)} sx={{ color: '#64748b' }}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete template">
                          <IconButton size="small" onClick={() => handleDelete(t.id)} sx={{ color: '#ef4444' }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>

                    {/* Media preview thumbnail if template has attached media */}
                    {hasMedia && (
                      <Box
                        sx={{
                          mb: 1.5,
                          p: 1,
                          bgcolor: '#f8fafc',
                          borderRadius: 1.5,
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                        }}
                      >
                        {isImage && previewSrc ? (
                          <Box
                            component="img"
                            src={previewSrc}
                            alt="Template Media"
                            onClick={() => setPreviewMediaUrl(previewSrc)}
                            sx={{
                              width: 48,
                              height: 48,
                              objectFit: 'cover',
                              borderRadius: 1,
                              cursor: 'pointer',
                              border: '1px solid #cbd5e1',
                              '&:hover': { opacity: 0.85 },
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: 1,
                              bgcolor: '#fee2e2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#dc2626',
                            }}
                          >
                            <PictureAsPdfIcon fontSize="small" />
                          </Box>
                        )}
                        <Box sx={{ overflow: 'hidden', flex: 1 }}>
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ color: '#1e293b' }}>
                            {t.file_name || (isImage ? 'Attached Image' : 'Attached Document')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {isImage ? 'High Definition Image' : 'Document File'}
                          </Typography>
                        </Box>
                      </Box>
                    )}

                    {/* Message content snippet */}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        bgcolor: '#f8fafc',
                        p: 1.5,
                        borderRadius: 1.5,
                        border: '1px solid #f1f5f9',
                        fontFamily: 'inherit',
                        fontSize: '0.85rem',
                        lineHeight: 1.5,
                        maxHeight: 120,
                        overflowY: 'auto',
                      }}
                    >
                      {t.content || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(No text, media only)</span>}
                    </Typography>
                  </Box>

                  {/* Use Template Action */}
                  <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<SendIcon sx={{ fontSize: '14px !important' }} />}
                      onClick={() => handleUseTemplate(t)}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        borderColor: '#25D366',
                        color: '#128C7E',
                        '&:hover': {
                          borderColor: '#128C7E',
                          bgcolor: 'rgba(37, 211, 102, 0.04)',
                        },
                      }}
                    >
                      Use Template
                    </Button>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* Create / Edit Template Modal */}
        <Dialog open={openDialog} onClose={() => !saving && setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {editingTemplate ? 'Edit Message Template' : 'Create Message Template'}
            <IconButton size="small" onClick={() => setOpenDialog(false)} disabled={saving}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent dividers sx={{ py: 2.5 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Stack spacing={2.5}>
              <TextField
                label="Template Name"
                placeholder="e.g. Ramadan Special Discount / Store Offer"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                required
                size="small"
              />

              <TextField
                label="Category"
                placeholder="e.g. Promotional, Greeting, Support"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                fullWidth
                size="small"
              />

              {/* Dynamic Tag Injector Pills */}
              <Box>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Insert Dynamic Variables:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    label="{name} (Contact Name)"
                    size="small"
                    onClick={() => insertTag('{name}')}
                    clickable
                    sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600, fontSize: '0.75rem' }}
                  />
                  <Chip
                    label="{phone} (Phone Number)"
                    size="small"
                    onClick={() => insertTag('{phone}')}
                    clickable
                    sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: '0.75rem' }}
                  />
                  <Chip
                    label="{email} (Email)"
                    size="small"
                    onClick={() => insertTag('{email}')}
                    clickable
                    sx={{ bgcolor: '#f3e8ff', color: '#7e22ce', fontWeight: 600, fontSize: '0.75rem' }}
                  />
                  <Chip
                    label="{website} (Website)"
                    size="small"
                    onClick={() => insertTag('{website}')}
                    clickable
                    sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 600, fontSize: '0.75rem' }}
                  />
                </Stack>
              </Box>

              {/* Message Body */}
              <TextField
                label="Message Body"
                placeholder="Write your template text here... You can use WhatsApp formatting (*bold*, _italic_, ~strikethrough~)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                multiline
                rows={4}
                fullWidth
                helperText={`${content.length} characters`}
              />

              {/* Attached Photo / Document Section */}
              <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: 2, p: 2, bgcolor: '#f8fafc' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                  accept="image/*,application/pdf,.doc,.docx"
                />

                {!attachedMedia ? (
                  <Box sx={{ textAlign: 'center', py: 1 }}>
                    <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
                      Attached Media / Photo (Optional)
                    </Typography>
                    <Stack direction="row" spacing={1.5} justifyContent="center">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddPhotoAlternateIcon />}
                        onClick={() => fileInputRef.current?.click()}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 600,
                          borderRadius: 1.5,
                          borderColor: '#cbd5e1',
                          color: '#334155',
                        }}
                      >
                        Attach Photo / Image
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AttachFileIcon />}
                        onClick={() => fileInputRef.current?.click()}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 600,
                          borderRadius: 1.5,
                          borderColor: '#cbd5e1',
                          color: '#334155',
                        }}
                      >
                        Attach Document
                      </Button>
                    </Stack>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
                      Supported formats: JPG, PNG, WEBP, PDF (Max 15MB)
                    </Typography>
                  </Box>
                ) : (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        ATTACHED FILE PREVIEW
                      </Typography>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteOutlineIcon />}
                        onClick={() => setAttachedMedia(null)}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0 }}
                      >
                        Remove Attachment
                      </Button>
                    </Box>

                    <Paper
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        bgcolor: '#fff',
                      }}
                    >
                      {attachedMedia.previewUrl ? (
                        <Box
                          component="img"
                          src={attachedMedia.previewUrl}
                          alt="Preview"
                          sx={{
                            width: 60,
                            height: 60,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: '1px solid #e2e8f0',
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: 60,
                            height: 60,
                            borderRadius: 1,
                            bgcolor: '#fee2e2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#dc2626',
                          }}
                        >
                          <PictureAsPdfIcon />
                        </Box>
                      )}

                      <Box sx={{ flex: 1, overflow: 'hidden' }}>
                        <Typography variant="body2" fontWeight={700} noWrap sx={{ color: '#0f172a' }}>
                          {attachedMedia.fileName}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                          <Chip
                            label={attachedMedia.type === 'image' ? 'Image File' : 'Document File'}
                            size="small"
                            sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
                          />
                          {attachedMedia.fileSize && (
                            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                              {attachedMedia.fileSize}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    </Paper>
                  </Box>
                )}
              </Box>
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setOpenDialog(false)} disabled={saving} sx={{ textTransform: 'none', color: '#64748b' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
              sx={{
                bgcolor: '#25D366',
                '&:hover': { bgcolor: '#128C7E' },
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 1.5,
                px: 2.5,
              }}
            >
              {saving ? 'Saving...' : editingTemplate ? 'Update Template' : 'Save Template'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Full Image Preview Modal */}
        <Dialog open={Boolean(previewMediaUrl)} onClose={() => setPreviewMediaUrl(null)} maxWidth="md">
          <Box sx={{ p: 1, position: 'relative', bgcolor: '#000' }}>
            <IconButton
              onClick={() => setPreviewMediaUrl(null)}
              sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', bgcolor: 'rgba(0,0,0,0.6)' }}
            >
              <CloseIcon />
            </IconButton>
            {previewMediaUrl && (
              <Box
                component="img"
                src={previewMediaUrl}
                alt="Full Preview"
                sx={{ width: '100%', maxHeight: '80vh', objectFit: 'contain' }}
              />
            )}
          </Box>
        </Dialog>
      </CardContent>
    </Card>
  );
}
