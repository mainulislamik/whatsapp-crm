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
  const [title, setTitle] = useState<string>('New Broadcast Campaign');
  const [delay, setDelay] = useState<number>(5);
  const [loading, setLoading] = useState<boolean>(false);
  const [openConfirm, setOpenConfirm] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Media Attachment State
  const [attachedFile, setAttachedFile] = useState<{
    file: File;
    base64: string;
    type: 'image' | 'document';
    previewUrl?: string;
  } | null>(null);

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
        file_name: attachedFile?.file.name,
        mime_type: attachedFile?.file.type,
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
          <Chip
            label={`${selectedContactIds.length} Recipients Selected`}
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
                    label={attachedFile.file.name}
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
                Attached file: <b>{attachedFile.file.name}</b>
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
      </CardContent>
    </Card>
  );
}
