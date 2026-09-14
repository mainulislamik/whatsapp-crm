'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  LinearProgress,
  Stack,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import CancelIcon from '@mui/icons-material/Cancel';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Campaign, CampaignLog, BroadcastService } from '@/lib/api';

export default function CampaignHistory() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedLogs, setSelectedLogs] = useState<CampaignLog[] | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await BroadcastService.listCampaigns();
      setCampaigns(res.data);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    const interval = setInterval(fetchCampaigns, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleViewLogs = async (camp: Campaign) => {
    setActiveCampaign(camp);
    try {
      const res = await BroadcastService.getLogs(camp.id);
      setSelectedLogs(res.data.logs);
      setOpenDialog(true);
    } catch (err: any) {
      alert('Log fetch failed');
    }
  };

  const handleCancel = async (campId: number) => {
    if (!confirm('আপনি কি এই ক্যাম্পেইন বাতিল করতে চান?')) return;
    try {
      await BroadcastService.cancel(campId);
      fetchCampaigns();
    } catch (err) {
      alert('Failed to cancel campaign');
    }
  };

  const handleDownloadCsv = (campId: number) => {
    window.open(BroadcastService.getExportCsvUrl(campId), '_blank');
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Chip label="সম্পন্ন" color="success" size="small" />;
      case 'RUNNING':
        return <Chip label="চলছে..." color="warning" size="small" />;
      case 'SCHEDULED':
        return <Chip label="শিডিউল করা" color="secondary" size="small" />;
      case 'PENDING':
        return <Chip label="অপেক্ষমান" color="info" size="small" />;
      case 'CANCELLED':
        return <Chip label="বাতিল" color="default" size="small" />;
      case 'FAILED':
        return <Chip label="ব্যর্থ" color="error" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2, gap: 1 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon /> ক্যাম্পেইন ও ডেলিভারি হিস্ট্রি
            </Typography>
            <Typography variant="body2" color="text.secondary">
              আপনার পাঠানো সকল বাল্ক ক্যাম্পেইনের লাইভ ফলাফল ও CSV এক্সপোর্ট রিপোর্ট।
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchCampaigns}
          >
            রিফ্রেশ
          </Button>
        </Stack>

        {loading && <LinearProgress sx={{ mb: 1.5 }} />}

        <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700 }}>ক্যাম্পেইন নাম</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>মিডিয়া</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>মোট প্রাপক</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>পাঠানো হয়েছে</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ব্যর্থ</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>স্ট্যাটাস</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>সময়</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>অ্যাকশন</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    এখনো কোনো ক্যাম্পেইন চালানো হয়নি।
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{c.title}</TableCell>
                    <TableCell>
                      {c.has_media ? (
                        c.media_type === 'image' ? (
                          <Tooltip title={`ছবি: ${c.file_name || 'image'}`}>
                            <ImageIcon color="primary" fontSize="small" />
                          </Tooltip>
                        ) : (
                          <Tooltip title={`ডকুমেন্ট: ${c.file_name || 'document'}`}>
                            <DescriptionIcon color="secondary" fontSize="small" />
                          </Tooltip>
                        )
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{c.total_recipients}</TableCell>
                    <TableCell sx={{ color: 'success.main', fontWeight: 600 }}>{c.sent_count}</TableCell>
                    <TableCell sx={{ color: c.failed_count > 0 ? 'error.main' : 'text.secondary' }}>
                      {c.failed_count}
                    </TableCell>
                    <TableCell>{getStatusChip(c.status)}</TableCell>
                    <TableCell sx={{ fontSize: '0.82rem' }}>
                      {c.scheduled_at
                        ? `📅 ${new Date(c.scheduled_at).toLocaleString('bn-BD')}`
                        : new Date(c.created_at).toLocaleString('bn-BD')}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        <Tooltip title="লগ দেখুন">
                          <IconButton size="small" color="primary" onClick={() => handleViewLogs(c)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="CSV রিপোর্ট ডাউনলোড">
                          <IconButton size="small" color="secondary" onClick={() => handleDownloadCsv(c.id)}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {(c.status === 'RUNNING' || c.status === 'SCHEDULED' || c.status === 'PENDING') && (
                          <Tooltip title="ক্যাম্পেইন বাতিল করুন">
                            <IconButton size="small" color="error" onClick={() => handleCancel(c.id)}>
                              <CancelIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Logs Dialog */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>ক্যাম্পেইন লগ: {activeCampaign?.title}</Box>
            {activeCampaign && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={() => handleDownloadCsv(activeCampaign.id)}
              >
                CSV রিপোর্ট
              </Button>
            )}
          </DialogTitle>
          <DialogContent>
            <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1, maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>প্রাপকের নাম</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ফোন নম্বর</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>স্ট্যাটাস</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>মেসেজ প্রিভিউ</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>পাঠানোর সময়</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedLogs?.map((log) => (
                    <TableRow key={log.id} hover>
                      <TableCell>{log.contact_name || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{log.phone || '—'}</TableCell>
                      <TableCell>
                        {log.status === 'SENT' ? (
                          <Chip
                            icon={<CheckCircleOutlineIcon />}
                            label="Sent"
                            color="success"
                            size="small"
                          />
                        ) : log.status === 'FAILED' ? (
                          <Tooltip title={log.error_message || 'Error'}>
                            <Chip
                              icon={<ErrorOutlineIcon />}
                              label="Failed"
                              color="error"
                              size="small"
                            />
                          </Tooltip>
                        ) : (
                          <Chip label="Pending" size="small" />
                        )}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.message}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>
                        {log.sent_at ? new Date(log.sent_at).toLocaleTimeString('bn-BD') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>বন্ধ করুন</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
