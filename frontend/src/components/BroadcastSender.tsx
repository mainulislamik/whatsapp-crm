'use client';

import React, { useState, useEffect } from 'react';
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
  FormControlLabel,
  Switch,
  Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SecurityIcon from '@mui/icons-material/Security';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PeopleIcon from '@mui/icons-material/People';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SyncIcon from '@mui/icons-material/Sync';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Paper,
  IconButton,
} from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { BroadcastService, Contact, Lead, LeadService } from '@/lib/api';

interface BroadcastSenderProps {
  selectedContactIds: number[];
  onSelectedContactIdsChange?: (ids: number[]) => void;
  onGoToLeads?: () => void;
  messageText: string;
  onMessageChange: (text: string) => void;
  onCampaignStarted: () => void;
  templateMedia?: {
    base64: string;
    type: string;
    fileName: string;
    mimeType: string;
  };
}

export default function BroadcastSender({
  selectedContactIds,
  onSelectedContactIdsChange,
  onGoToLeads,
  messageText,
  onMessageChange,
  onCampaignStarted,
  templateMedia,
}: BroadcastSenderProps) {
  const [title, setTitle] = useState<string>('New Broadcast Campaign');
  const [delay, setDelay] = useState<number>(5);
  const [loading, setLoading] = useState<boolean>(false);
  const [openConfirm, setOpenConfirm] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Audience Modal State
  const [openContactModal, setOpenContactModal] = useState<boolean>(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contactSearch, setContactSearch] = useState<string>('');
  const [contactLoading, setContactLoading] = useState<boolean>(false);

  const loadLeads = async () => {
    setContactLoading(true);
    try {
      const res = await LeadService.list();
      setLeads(res.data || []);
    } catch (err) {
      console.error('Failed to load leads in BroadcastSender:', err);
    } finally {
      setContactLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const toggleSelectOne = (id: number) => {
    if (!onSelectedContactIdsChange) return;
    if (selectedContactIds.includes(id)) {
      onSelectedContactIdsChange(selectedContactIds.filter((x) => x !== id));
    } else {
      onSelectedContactIdsChange([...selectedContactIds, id]);
    }
  };

  const toggleSelectAll = (filtered: Lead[]) => {
    if (!onSelectedContactIdsChange) return;
    const filteredIds = filtered.map((c) => c.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedContactIds.includes(id));
    if (allSelected) {
      onSelectedContactIdsChange(selectedContactIds.filter((id) => !filteredIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedContactIds, ...filteredIds]));
      onSelectedContactIdsChange(merged);
    }
  };

  // Media Attachment State
  const [attachedFile, setAttachedFile] = useState<{
    file?: File;
    fileName?: string;
    base64: string;
    type: 'image' | 'document';
    mimeType?: string;
    previewUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (templateMedia && templateMedia.base64) {
      const isImg = templateMedia.type === 'image' || templateMedia.mimeType?.startsWith('image/');
      setAttachedFile({
        fileName: templateMedia.fileName || 'template_media',
        base64: templateMedia.base64,
        type: isImg ? 'image' : 'document',
        mimeType: templateMedia.mimeType || (isImg ? 'image/jpeg' : 'application/octet-stream'),
        previewUrl: isImg ? `data:${templateMedia.mimeType || 'image/jpeg'};base64,${templateMedia.base64}` : undefined,
      });
    }
  }, [templateMedia]);

  // Scheduling State
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduleDateTime, setScheduleDateTime] = useState<string>('');

  const insertTag = (tag: string) => {
    onMessageChange(messageText + tag);
  };

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

  const removeAttachment = () => {
    setAttachedFile(null);
  };

  const handleStartBroadcast = async () => {
    if (selectedContactIds.length === 0) {
      setStatusMsg({ type: 'error', text: 'Please select at least one contact first.' });
      return;
    }
    if (!messageText.trim() && !attachedFile) {
      setStatusMsg({ type: 'error', text: 'Message text or media attachment is required.' });
      return;
    }
    if (isScheduled && !scheduleDateTime) {
      setStatusMsg({ type: 'error', text: 'Please choose date and time for scheduled send.' });
      return;
    }

    setOpenConfirm(false);
    setLoading(true);
    setStatusMsg(null);

    try {
      const res = await BroadcastService.start({
        title: title.trim() || 'WhatsApp Broadcast',
        message_template: messageText.trim(),
        contact_ids: selectedContactIds,
        delay_seconds: delay,
        media_base64: attachedFile?.base64,
        media_type: attachedFile?.type,
        file_name: attachedFile?.fileName || attachedFile?.file?.name,
        mime_type: attachedFile?.mimeType || attachedFile?.file?.type,
        scheduled_at: isScheduled && scheduleDateTime ? new Date(scheduleDateTime).toISOString() : undefined,
      });

      setStatusMsg({
        type: 'success',
        text: res.data.message || 'Campaign started successfully!',
      });
      onCampaignStarted();
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.response?.data?.detail || err.message || 'Failed to start campaign.',
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
              <SendIcon color="secondary" /> Bulk Broadcast Sender
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Send personalized text, images, and documents to multiple users.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant={selectedContactIds.length === 0 ? "contained" : "outlined"}
              color="primary"
              size="small"
              startIcon={<PeopleIcon />}
              onClick={() => {
                loadLeads();
                setOpenContactModal(true);
              }}
              sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
            >
              {selectedContactIds.length === 0 ? 'Select Contacts / Audience' : 'Change Audience'}
            </Button>
            <Chip
              label={`${selectedContactIds.length} Recipients Selected`}
              color={selectedContactIds.length > 0 ? 'primary' : 'default'}
              sx={{ fontWeight: 700, fontSize: '0.85rem' }}
            />
          </Stack>
        </Stack>

        {statusMsg && (
          <Alert severity={statusMsg.type} sx={{ mb: 2 }} onClose={() => setStatusMsg(null)}>
            {statusMsg.text}
          </Alert>
        )}

        <Stack spacing={2.5}>
          <TextField
            label="Campaign Title *"
            size="small"
            fullWidth
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Dynamic Tags & Spintax Helpers */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.8 }}>
              Dynamic Variables & Spintax Helpers (Click to insert):
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                label="{name} (Contact Name)"
                size="small"
                onClick={() => insertTag('{name}')}
                clickable
                color="secondary"
                variant="outlined"
              />
              <Chip
                label="{phone} (Phone Number)"
                size="small"
                onClick={() => insertTag('{phone}')}
                clickable
                color="secondary"
                variant="outlined"
              />
              <Tooltip title="Each recipient receives a randomly selected variant to avoid spam detection">
                <Chip
                  icon={<AutoAwesomeIcon fontSize="small" />}
                  label="{Hello|Hi|Greetings} (Spintax)"
                  size="small"
                  onClick={() => insertTag('{Hello|Hi|Greetings}')}
                  clickable
                  color="primary"
                  variant="outlined"
                />
              </Tooltip>
            </Stack>
          </Box>

          <TextField
            label="Message Content *"
            fullWidth
            multiline
            rows={4}
            value={messageText}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="{Hello|Hi} {name}! Check out our special announcement..."
            helperText="Using Spintax variations prevents account flags and keeps messages organic."
          />

          {/* Media Attachment Row */}
          <Box sx={{ p: 1.5, border: '1px dashed #cbd5e1', borderRadius: 1.5, bgcolor: '#f8fafc' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button
                  component="label"
                  variant="outlined"
                  size="small"
                  startIcon={<AttachFileIcon />}
                >
                  Attach Image / Document
                  <input
                    type="file"
                    hidden
                    accept="image/*,.pdf,.doc,.docx,.xlsx"
                    onChange={handleFileUpload}
                  />
                </Button>
                <Typography variant="caption" color="text.secondary">
                  (JPG, PNG, PDF, DOCX — max 20MB)
                </Typography>
              </Stack>

              {attachedFile && (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  {attachedFile.previewUrl && (
                    <Box
                      component="img"
                      src={attachedFile.previewUrl}
                      alt="Preview"
                      sx={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 1 }}
                    />
                  )}
                  <Chip
                    label={attachedFile.fileName || attachedFile.file?.name || 'Attached File'}
                    onDelete={removeAttachment}
                    deleteIcon={<CloseIcon />}
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                </Stack>
              )}
            </Stack>
          </Box>

          {/* Scheduling Toggle */}
          <Box sx={{ p: 1.5, bgcolor: '#f1f5f9', borderRadius: 1.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Schedule for Later (Optional)
                </Typography>
              }
            />
            {isScheduled && (
              <Box sx={{ mt: 1.5 }}>
                <TextField
                  type="datetime-local"
                  size="small"
                  label="Scheduled Delivery Time"
                  InputLabelProps={{ shrink: true }}
                  value={scheduleDateTime}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  fullWidth
                />
              </Box>
            )}
          </Box>

          {/* Anti-Ban Delay Controller */}
          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
              <SecurityIcon color="success" fontSize="small" />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Anti-Ban Protection Delay: {delay}s (±1.5s random human jitter)
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
              System dynamically varies intervals between sends to mirror natural human typing rhythms.
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
              startIcon={isScheduled ? <ScheduleIcon /> : <SendIcon />}
              onClick={() => setOpenConfirm(true)}
              disabled={loading || selectedContactIds.length === 0 || (!messageText.trim() && !attachedFile)}
              sx={{ px: 4, py: 1.2, fontWeight: 700 }}
            >
              {isScheduled
                ? `Confirm Schedule (${selectedContactIds.length})`
                : `Start Broadcast (${selectedContactIds.length})`}
            </Button>
          </Box>
        </Stack>

        {/* Confirmation Modal */}
        <Dialog open={openConfirm} onClose={() => setOpenConfirm(false)}>
          <DialogTitle sx={{ fontWeight: 700 }}>Confirm Broadcast</DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 1.5 }}>
              You are about to {isScheduled ? 'schedule messages for' : 'send messages to'}{' '}
              <b>{selectedContactIds.length}</b> contact(s).
            </Typography>
            {attachedFile && (
              <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
                Attached file: <b>{attachedFile.fileName || attachedFile.file?.name || 'Attached File'}</b>
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              Average delay: <b>{delay} seconds</b> per recipient.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenConfirm(false)}>Cancel</Button>
            <Button variant="contained" color="primary" onClick={handleStartBroadcast}>
              Yes, Confirm & Start
            </Button>
          </DialogActions>
        </Dialog>

        {/* Quick Lead Selection Modal */}
        <Dialog
          open={openContactModal}
          onClose={() => setOpenContactModal(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StorefrontIcon color="primary" /> Select Broadcast Recipients from Leads ({selectedContactIds.length} Selected)
            </Box>
            <IconButton size="small" onClick={() => setOpenContactModal(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </DialogTitle>

          <DialogContent dividers sx={{ py: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}>
              <TextField
                size="small"
                placeholder="Search leads by shop name, phone, or category..."
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                sx={{ flexGrow: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                InputProps={{
                  startAdornment: <SearchIcon fontSize="small" sx={{ color: 'text.secondary', mr: 1 }} />,
                }}
              />

              <Button
                variant="outlined"
                size="small"
                startIcon={<StorefrontIcon />}
                onClick={() => {
                  setOpenContactModal(false);
                  if (onGoToLeads) onGoToLeads();
                }}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
              >
                Go to Lead Management
              </Button>
            </Stack>

            {contactLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <LinearProgress sx={{ width: '100%' }} />
              </Box>
            ) : (() => {
              const filtered = leads.filter((l) => {
                const s = contactSearch.toLowerCase();
                const shop = (l.shop_name || '').toLowerCase();
                const phone = (l.phone || '').toLowerCase();
                const cat = (l.category || '').toLowerCase();
                return shop.includes(s) || phone.includes(s) || cat.includes(s);
              });

              const allFilteredSelected =
                filtered.length > 0 && filtered.every((l) => selectedContactIds.includes(l.id));

              if (leads.length === 0) {
                return (
                  <Box sx={{ textAlign: 'center', py: 4, bgcolor: '#f8fafc', borderRadius: 2 }}>
                    <StorefrontIcon sx={{ fontSize: 40, color: '#94a3b8', mb: 1 }} />
                    <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1e293b' }}>
                      No leads found in directory
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Go to Lead Management to scan new leads or add shops.
                    </Typography>
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<StorefrontIcon />}
                      onClick={() => {
                        setOpenContactModal(false);
                        if (onGoToLeads) onGoToLeads();
                      }}
                      sx={{ bgcolor: '#10b981', '&:hover': { bgcolor: '#059669' }, fontWeight: 700 }}
                    >
                      Open Lead Manager
                    </Button>
                  </Box>
                );
              }

              return (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380, borderRadius: 2 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={allFilteredSelected}
                            indeterminate={filtered.some((l) => selectedContactIds.includes(l.id)) && !allFilteredSelected}
                            onChange={() => toggleSelectAll(filtered)}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Shop / Name</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Phone / WhatsApp</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filtered.map((l) => {
                        const isSelected = selectedContactIds.includes(l.id);
                        return (
                          <TableRow
                            key={l.id}
                            hover
                            onClick={() => toggleSelectOne(l.id)}
                            selected={isSelected}
                            sx={{ cursor: 'pointer' }}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox checked={isSelected} />
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{l.shop_name || `Lead ${l.phone.slice(-4)}`}</TableCell>
                            <TableCell sx={{ fontFamily: 'monospace' }}>{l.phone}</TableCell>
                            <TableCell>
                              <Chip label={l.category || 'Retail'} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={l.status || 'NEW'}
                                size="small"
                                color={l.is_contacted ? 'success' : 'default'}
                                variant="outlined"
                                sx={{ fontSize: '0.7rem', height: 20 }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            })()}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              {selectedContactIds.length} lead(s) selected for broadcast
            </Typography>
            <Button
              variant="contained"
              onClick={() => setOpenContactModal(false)}
              sx={{ fontWeight: 700, borderRadius: 2 }}
            >
              Done / Apply ({selectedContactIds.length})
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
