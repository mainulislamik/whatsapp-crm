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
      alert('Failed to fetch campaign logs.');
    }
  };

  const handleCancel = async (campId: number) => {
    if (!confirm('Are you sure you want to cancel this campaign?')) return;
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
        return <Chip label="Completed" color="success" size="small" />;
      case 'RUNNING':
        return <Chip label="Running" color="warning" size="small" />;
      case 'SCHEDULED':
        return <Chip label="Scheduled" color="secondary" size="small" />;
      case 'PENDING':
        return <Chip label="Pending" color="info" size="small" />;
      case 'CANCELLED':
        return <Chip label="Cancelled" color="default" size="small" />;
      case 'FAILED':
        return <Chip label="Failed" color="error" size="small" />;
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
              <HistoryIcon /> Campaign & Delivery History
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Live delivery results, recipient logs, and CSV export for all campaigns.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchCampaigns}
          >
            Refresh
          </Button>
        </Stack>

        {loading && <LinearProgress sx={{ mb: 1.5 }} />}

        <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Campaign Title</TableCell>
                <TableCell>Media</TableCell>
                <TableCell>Recipients</TableCell>
                <TableCell>Sent</TableCell>
                <TableCell>Failed</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Timestamp</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No campaigns found.
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{c.title}</TableCell>
                    <TableCell>
                      {c.has_media ? (
                        c.media_type === 'image' ? (
                          <Tooltip title={`Image: ${c.file_name || 'image'}`}>
                            <ImageIcon color="primary" fontSize="small" />
                          </Tooltip>
                        ) : (
                          <Tooltip title={`Document: ${c.file_name || 'document'}`}>
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
                        ? `📅 ${new Date(c.scheduled_at).toLocaleString()}`
                        : new Date(c.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        <Tooltip title="View Logs">
                          <IconButton size="small" color="primary" onClick={() => handleViewLogs(c)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Download CSV Report">
                          <IconButton size="small" color="secondary" onClick={() => handleDownloadCsv(c.id)}>
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {(c.status === 'RUNNING' || c.status === 'SCHEDULED' || c.status === 'PENDING') && (
                          <Tooltip title="Cancel Campaign">
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
            <Box>Campaign Logs: {activeCampaign?.title}</Box>
            {activeCampaign && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={() => handleDownloadCsv(activeCampaign.id)}
              >
                CSV Report
              </Button>
            )}
          </DialogTitle>
          <DialogContent>
            <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1, maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Recipient Name</TableCell>
                    <TableCell>Phone Number</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Message Preview</TableCell>
                    <TableCell>Sent Time</TableCell>
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
                        {log.sent_at ? new Date(log.sent_at).toLocaleTimeString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
