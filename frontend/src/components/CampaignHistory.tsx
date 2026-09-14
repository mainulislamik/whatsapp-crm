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
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Campaign, CampaignLog, BroadcastService } from '@/lib/api';

export default function CampaignHistory() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedLogs, setSelectedLogs] = useState<CampaignLog[] | null>(null);
  const [activeCampaignTitle, setActiveCampaignTitle] = useState<string>('');
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
    setActiveCampaignTitle(camp.title);
    try {
      const res = await BroadcastService.getLogs(camp.id);
      setSelectedLogs(res.data.logs);
      setOpenDialog(true);
    } catch (err: any) {
      alert('Log fetch failed');
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Chip label="সম্পন্ন" color="success" size="small" />;
      case 'RUNNING':
        return <Chip label="চলছে..." color="warning" size="small" />;
      case 'PENDING':
        return <Chip label="অপেক্ষমান" color="info" size="small" />;
      case 'FAILED':
        return <Chip label="ব্যর্থ" color="error" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon /> ক্যাম্পেইন ও ডেলিভারি হিস্ট্রি
            </Typography>
            <Typography variant="body2" color="text.secondary">
              আপনার পাঠানো সকল বাল্ক ক্যাম্পেইনের বর্তমান লাইভ স্ট্যাটাস।
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
        </Box>

        {loading && <LinearProgress sx={{ mb: 1.5 }} />}

        <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700 }}>ক্যাম্পেইন নাম</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>মোট প্রাপক</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>পাঠানো হয়েছে</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ব্যর্থ</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>স্ট্যাটাস</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>সময়</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>বিস্তারিত</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    এখনো কোনো ক্যাম্পেইন চালানো হয়নি।
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{c.title}</TableCell>
                    <TableCell>{c.total_recipients}</TableCell>
                    <TableCell sx={{ color: 'success.main', fontWeight: 600 }}>{c.sent_count}</TableCell>
                    <TableCell sx={{ color: c.failed_count > 0 ? 'error.main' : 'text.secondary' }}>
                      {c.failed_count}
                    </TableCell>
                    <TableCell>{getStatusChip(c.status)}</TableCell>
                    <TableCell sx={{ fontSize: '0.85rem' }}>
                      {new Date(c.created_at).toLocaleString('bn-BD')}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="লগ দেখুন">
                        <IconButton size="small" color="primary" onClick={() => handleViewLogs(c)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Logs Dialog */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>
            ক্যাম্পেইন লগ: {activeCampaignTitle}
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
