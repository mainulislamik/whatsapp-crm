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
  const [title, setTitle] = useState<string>('নতুন প্রচার ক্যাম্পেইন');
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

    // Check size limit (max 20MB)
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

  const removeAttachment = () => {
    setAttachedFile(null);
  };

  const handleStartBroadcast = async () => {
    if (selectedContactIds.length === 0) {
      setStatusMsg({ type: 'error', text: 'অনুগ্রহ করে প্রথমে কমপক্ষে একজন কন্টাক্ট সিলেক্ট করুন।' });
      return;
    }
    if (!messageText.trim() && !attachedFile) {
      setStatusMsg({ type: 'error', text: 'মেসেজ কন্টেন্ট অথবা ফাইল এটাচমেন্ট আবশ্যক।' });
      return;
    }
    if (isScheduled && !scheduleDateTime) {
      setStatusMsg({ type: 'error', text: 'শিডিউল করার জন্য তারিখ ও সময় নির্বাচন করুন।' });
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
        text: res.data.message || 'ক্যাম্পেইন সফলভাবে তৈরি হয়েছে!',
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
              ছবি, ডকুমেন্ট ও টেক্সট সহ একসাথে একাধিক ইউজারের কাছে পাঠান।
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

          {/* Dynamic Tags & Spintax Helpers */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.8 }}>
              ডায়নামিক ট্যাগ ও স্পিনট্যাক্স হেল্পার (মেসেজে ইনসার্ট করতে ক্লিক করুন):
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                label="{name} (নাম)"
                size="small"
                onClick={() => insertTag('{name}')}
                clickable
                color="secondary"
                variant="outlined"
              />
              <Chip
                label="{phone} (ফোন নম্বর)"
                size="small"
                onClick={() => insertTag('{phone}')}
                clickable
                color="secondary"
                variant="outlined"
              />
              <Tooltip title="প্রতিটি প্রাপকের কাছে একেকটি ভিন্ন ভ্যারিয়েশন যাবে — অ্যান্টি-ব্যান সুরক্ষা">
                <Chip
                  icon={<AutoAwesomeIcon fontSize="small" />}
                  label="{আসসালামু আলাইকুম|নমস্কার|শুভ দিন} (Spintax)"
                  size="small"
                  onClick={() => insertTag('{আসসালামু আলাইকুম|নমস্কার|শুভ দিন}')}
                  clickable
                  color="primary"
                  variant="outlined"
                />
              </Tooltip>
            </Stack>
          </Box>

          <TextField
            label="মেসেজ কন্টেন্ট *"
            fullWidth
            multiline
            rows={4}
            value={messageText}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder="{আসসালামু আলাইকুম|নমস্কার} {name} ভাই! আমাদের বিশেষ অফার দেখতে সংযুক্ত ফাইলটি চেক করুন..."
            helperText="স্পিনট্যাক্স ব্যবহার করলে WhatsApp বট ধরতে পারবে না।"
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
                  ফাইল/ছবি এটাচ করুন
                  <input
                    type="file"
                    hidden
                    accept="image/*,.pdf,.doc,.docx,.xlsx"
                    onChange={handleFileUpload}
                  />
                </Button>
                <Typography variant="caption" color="text.secondary">
                  (JPG, PNG, PDF, DOCX — সর্বোচ্চ 20MB)
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
                  নির্দিষ্ট সময়ে শিডিউল করুন (Scheduled Send)
                </Typography>
              }
            />
            {isScheduled && (
              <Box sx={{ mt: 1.5 }}>
                <TextField
                  type="datetime-local"
                  size="small"
                  label="পাঠানোর সময়"
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
                অ্যান্টি-ব্যান সুরক্ষা ডিলে: {delay} সেকেন্ড (± ১.৫ সে. র্যান্ডম হিউম্যান জিটার)
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '0.82rem' }}>
              সিস্টেম প্রতি মেসেজে স্বয়ংক্রিয়ভাবে সামান্য সময় পরিবর্তন করে মানুষের মতো আচরণ তৈরি করে।
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
                ? `শিডিউল নিশ্চিত করুন (${selectedContactIds.length})`
                : `বাল্ক মেসেজ শুরু করুন (${selectedContactIds.length})`}
            </Button>
          </Box>
        </Stack>

        {/* Confirmation Modal */}
        <Dialog open={openConfirm} onClose={() => setOpenConfirm(false)}>
          <DialogTitle sx={{ fontWeight: 700 }}>আপনি কি নিশ্চিত?</DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 1.5 }}>
              আপনি <b>{selectedContactIds.length}</b> জন কন্টাক্টকে মেসেজ {isScheduled ? 'শিডিউল করতে' : 'পাঠাতে'} যাচ্ছেন।
            </Typography>
            {attachedFile && (
              <Typography variant="body2" color="primary" sx={{ mb: 1 }}>
                সংযুক্ত ফাইল: <b>{attachedFile.file.name}</b>
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              প্রতিটি মেসেজের গড় ব্যবধান: <b>{delay} সেকেন্ড</b>।
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenConfirm(false)}>বাতিল</Button>
            <Button variant="contained" color="primary" onClick={handleStartBroadcast}>
              হ্যাঁ, নিশ্চিত করুন
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
