'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Tooltip,
  LinearProgress,
  Avatar,
  Badge,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Divider,
  Paper,
  Grid,
} from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ChatIcon from '@mui/icons-material/Chat';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import CategoryIcon from '@mui/icons-material/Category';
import BusinessIcon from '@mui/icons-material/Business';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SendIcon from '@mui/icons-material/Send';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Lead, LeadCategory, LeadService, ChatService } from '@/lib/api';

interface LeadManagerProps {
  onDirectMessage?: (phone: string) => void;
}

const SHOP_TYPES = ['Retail', 'Wholesale', 'Distributor', 'Online Store', 'Service Center', 'Corporate'];
const LEAD_STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'LOST'];

export default function LeadManager({ onDirectMessage }: LeadManagerProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [categories, setCategories] = useState<LeadCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Selected Lead for Modern Profile Popup
  const [profileLead, setProfileLead] = useState<Lead | null>(null);
  const [quickMsg, setQuickMsg] = useState<string>('');
  const [sendingQuickMsg, setSendingQuickMsg] = useState<boolean>(false);
  const [quickMsgSuccess, setQuickMsgSuccess] = useState<boolean>(false);
  const [copiedPhone, setCopiedPhone] = useState<boolean>(false);

  // Add / Edit Modal State
  const [openModal, setOpenModal] = useState<boolean>(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Form Fields
  const [phone, setPhone] = useState<string>('');
  const [shopName, setShopName] = useState<string>('');
  const [ownerName, setOwnerName] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [shopType, setShopType] = useState<string>('Retail');
  const [status, setStatus] = useState<string>('NEW');
  const [address, setAddress] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Live WhatsApp & AI Scan State
  const [scanningWa, setScanningWa] = useState<boolean>(false);
  const [waScanResult, setWaScanResult] = useState<{
    scanned: boolean;
    connected: boolean;
    exists: boolean;
    name?: string | null;
    profilePictureUrl?: string | null;
    about?: string | null;
    businessProfile?: any;
    sources_found?: string[];
    confidence?: string;
  } | null>(null);

  // Live Duplicate Check State
  const [checkingDup, setCheckingDup] = useState<boolean>(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    is_duplicate: boolean;
    type?: string;
    name?: string;
    phone?: string;
  } | null>(null);

  // Warning Confirmation Dialog for Duplicate Phone
  const [showDupWarningDialog, setShowDupWarningDialog] = useState<boolean>(false);

  // Inline Category Add Dialog
  const [openAddCategoryDialog, setOpenAddCategoryDialog] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');

  const fetchLeadsAndCategories = async () => {
    setLoading(true);
    try {
      const [leadsRes, catsRes] = await Promise.all([
        LeadService.list({
          search,
          category: selectedCategory,
          status: selectedStatus,
        }),
        LeadService.listCategories(),
      ]);
      setLeads(leadsRes.data || []);
      setCategories(catsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeadsAndCategories();
  }, [selectedCategory, selectedStatus]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLeadsAndCategories();
    }, 350);
    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  // Open Modern Profile Popup
  const handleOpenProfile = (lead: Lead) => {
    setProfileLead(lead);
    setQuickMsg('');
    setQuickMsgSuccess(false);
    setCopiedPhone(false);
  };

  const handleCopyPhone = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleSendQuickMessage = async () => {
    if (!profileLead || !quickMsg.trim()) return;
    setSendingQuickMsg(true);
    try {
      await ChatService.send(profileLead.phone, { message: quickMsg.trim() });
      setQuickMsg('');
      setQuickMsgSuccess(true);
      setTimeout(() => setQuickMsgSuccess(false), 3000);
    } catch (err) {
      alert('Failed to send WhatsApp message. Make sure WhatsApp is connected.');
    } finally {
      setSendingQuickMsg(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingLead(null);
    setPhone('');
    setShopName('');
    setOwnerName('');
    setCategory('General');
    setShopType('Retail');
    setStatus('NEW');
    setAddress('');
    setNotes('');
    setWaScanResult(null);
    setDuplicateInfo(null);
    setOpenModal(true);
  };

  const handleOpenEdit = (lead: Lead) => {
    setEditingLead(lead);
    setPhone(lead.phone);
    setShopName(lead.shop_name);
    setOwnerName(lead.owner_name || '');
    setCategory(lead.category || 'General');
    setShopType(lead.shop_type || 'Retail');
    setStatus(lead.status || 'NEW');
    setAddress(lead.address || '');
    setNotes(lead.notes || '');
    setWaScanResult({
      scanned: true,
      connected: true,
      exists: lead.is_on_whatsapp,
      name: lead.whatsapp_name || lead.shop_name,
      profilePictureUrl: lead.whatsapp_profile_pic,
      about: lead.whatsapp_about,
      sources_found: lead.is_on_whatsapp ? ['WhatsApp Profile'] : [],
      confidence: 'high',
    });
    setDuplicateInfo(null);
    setOpenModal(true);
  };

  const handlePhoneBlur = async () => {
    const p = phone.trim();
    if (!p) {
      setDuplicateInfo(null);
      return;
    }
    setCheckingDup(true);
    try {
      const res = await LeadService.checkPhone(p, editingLead?.id);
      setDuplicateInfo(res.data);
    } catch (err) {
      // ignore
    } finally {
      setCheckingDup(false);
    }
  };

  const handleScanWhatsApp = async () => {
    const p = phone.trim();
    if (!p) {
      alert('Please enter a phone number first to scan with AI.');
      return;
    }
    setScanningWa(true);
    try {
      const res = await LeadService.aiEnrich(p);
      let data = res.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {}
      }

      setWaScanResult({
        scanned: true,
        connected: true,
        exists: !!data?.is_on_whatsapp,
        name: data?.owner_name || data?.shop_name || null,
        profilePictureUrl: data?.profile_picture_url,
        about: data?.whatsapp_about,
        sources_found: data?.sources_found || [],
        confidence: data?.confidence || 'medium',
      });

      if (data?.shop_name) setShopName(data.shop_name);
      if (data?.owner_name) setOwnerName(data.owner_name);
      if (data?.address) setAddress(data.address);
      if (data?.notes) setNotes(data.notes);
      if (data?.shop_type) setShopType(data.shop_type);
      if (data?.category && data.category !== 'General') {
        const foundCat = categories.find(
          (c) => c.name.toLowerCase() === data.category.toLowerCase()
        );
        if (foundCat) setCategory(foundCat.name);
      }
    } catch (err: any) {
      console.error('AI Scan WhatsApp error:', err);
      setWaScanResult({
        scanned: true,
        connected: false,
        exists: false,
        sources_found: [],
        confidence: 'low',
      });
    } finally {
      setScanningWa(false);
    }
  };

  const handleSaveLead = async (force = false) => {
    const p = phone.trim();
    const sn = shopName.trim();

    if (!p) {
      alert('Phone number is required.');
      return;
    }
    if (!sn) {
      alert('Shop / Business name is required.');
      return;
    }

    if (!force && duplicateInfo?.is_duplicate && !editingLead) {
      setShowDupWarningDialog(true);
      return;
    }

    try {
      const payload = {
        phone: p,
        shop_name: sn,
        owner_name: ownerName.trim() || undefined,
        category,
        shop_type: shopType,
        status,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        force_save: force,
      };

      if (editingLead) {
        await LeadService.update(editingLead.id, payload);
      } else {
        await LeadService.create(payload);
      }

      setOpenModal(false);
      setShowDupWarningDialog(false);
      fetchLeadsAndCategories();
    } catch (err: any) {
      if (err.response?.status === 409 && !force) {
        setDuplicateInfo(err.response.data?.detail || { is_duplicate: true });
        setShowDupWarningDialog(true);
      } else {
        alert(err.response?.data?.detail || 'Failed to save lead.');
      }
    }
  };

  const handleDeleteLead = async (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete lead "${name}"?`)) {
      try {
        await LeadService.delete(id);
        if (profileLead?.id === id) setProfileLead(null);
        fetchLeadsAndCategories();
      } catch (err) {
        alert('Failed to delete lead.');
      }
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await LeadService.createCategory({ name: newCategoryName.trim() });
      setCategories([...categories, res.data]);
      setCategory(res.data.name);
      setNewCategoryName('');
      setOpenAddCategoryDialog(false);
    } catch (err) {
      alert('Failed to create category.');
    }
  };

  const getStatusColor = (st: string) => {
    switch (st) {
      case 'QUALIFIED': return { bg: '#dcfce7', text: '#15803d', border: '#86efac' };
      case 'INTERESTED': return { bg: '#e0e7ff', text: '#4338ca', border: '#a5b4fc' };
      case 'CONTACTED': return { bg: '#fef3c7', text: '#b45309', border: '#fde68a' };
      case 'LOST': return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' };
      default: return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    }
  };

  return (
    <Card sx={{ mb: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header Title & Actions */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2.5, gap: 1.5 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, color: '#0f172a' }}>
              <StorefrontIcon sx={{ color: '#10b981' }} /> Lead Management & CRM
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Click any shop row to view full profile, send instant WhatsApp messages, and manage customer leads.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => window.open(LeadService.getExportCsvUrl(), '_blank')}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              Export CSV
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenAdd}
              sx={{
                fontWeight: 700,
                borderRadius: 2,
                textTransform: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 3px 10px rgba(16, 185, 129, 0.3)',
              }}
            >
              Add New Lead
            </Button>
          </Stack>
        </Stack>

        {/* Filters Bar */}
        <Box sx={{ mb: 2.5, p: 2, bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px solid #e2e8f0' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <TextField
              size="small"
              placeholder="Search by shop name, owner, phone, or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
              sx={{ flexGrow: 1, bgcolor: '#ffffff', borderRadius: 1.5 }}
            />

            <FormControl size="small" sx={{ minWidth: 160, bgcolor: '#ffffff', borderRadius: 1.5 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={selectedCategory}
                label="Category"
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <MenuItem value="">
                  <em>All Categories</em>
                </MenuItem>
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.name}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 140, bgcolor: '#ffffff', borderRadius: 1.5 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={selectedStatus}
                label="Status"
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <MenuItem value="">
                  <em>All Statuses</em>
                </MenuItem>
                {LEAD_STATUSES.map((st) => (
                  <MenuItem key={st} value={st}>
                    {st}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <IconButton size="small" onClick={fetchLeadsAndCategories} sx={{ color: 'text.secondary', bgcolor: '#ffffff', border: '1px solid #e2e8f0' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>

        {loading && <LinearProgress sx={{ mb: 1.5, borderRadius: 1 }} />}

        {/* Uniform Sized Modern Leads Table */}
        <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2.5, overflow: 'hidden' }}>
          <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 800 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '28%', py: 1.5 }}>Shop & Profile</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '18%', py: 1.5 }}>Phone / WhatsApp</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '14%', py: 1.5 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '13%', py: 1.5 }}>Shop Type</TableCell>
                <TableCell sx={{ fontWeight: 800, color: '#0f172a', width: '12%', py: 1.5 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 800, color: '#0f172a', width: '15%', py: 1.5 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No leads found. Click "Add New Lead" to register a shop.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => {
                  const statusStyle = getStatusColor(lead.status);
                  return (
                    <TableRow
                      key={lead.id}
                      hover
                      onClick={() => handleOpenProfile(lead)}
                      sx={{
                        cursor: 'pointer',
                        height: 64,
                        transition: 'background-color 0.15s ease',
                        '&:hover': { bgcolor: '#f8fafc' },
                      }}
                    >
                      {/* Shop Name & Avatar */}
                      <TableCell sx={{ py: 1 }}>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                          <Badge
                            overlap="circular"
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            badgeContent={
                              lead.is_on_whatsapp ? (
                                <Tooltip title="Verified on WhatsApp">
                                  <CheckCircleIcon sx={{ color: '#25D366', fontSize: 16, bgcolor: '#ffffff', borderRadius: '50%' }} />
                                </Tooltip>
                              ) : null
                            }
                          >
                            <Avatar
                              src={lead.whatsapp_profile_pic || undefined}
                              sx={{
                                width: 40,
                                height: 40,
                                bgcolor: '#0f172a',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.08)',
                              }}
                            >
                              {lead.shop_name.charAt(0).toUpperCase()}
                            </Avatar>
                          </Badge>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 700,
                                color: '#0f172a',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                '&:hover': { color: '#10b981' },
                              }}
                            >
                              {lead.shop_name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {lead.owner_name ? `Owner: ${lead.owner_name}` : (lead.address || '—')}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* Phone & WhatsApp status */}
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e293b' }}>
                          {lead.phone}
                        </Typography>
                        {lead.is_on_whatsapp ? (
                          <Chip
                            icon={<WhatsAppIcon sx={{ fontSize: '0.85rem !important' }} />}
                            label="On WhatsApp"
                            size="small"
                            sx={{
                              fontSize: '0.68rem',
                              height: 20,
                              fontWeight: 700,
                              bgcolor: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #86efac',
                            }}
                          />
                        ) : (
                          <Chip
                            label="Not on WA"
                            size="small"
                            sx={{
                              fontSize: '0.68rem',
                              height: 20,
                              fontWeight: 600,
                              bgcolor: '#fee2e2',
                              color: '#991b1b',
                            }}
                          />
                        )}
                      </TableCell>

                      {/* Category */}
                      <TableCell sx={{ py: 1 }}>
                        <Chip
                          label={lead.category || 'General'}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            bgcolor: '#f1f5f9',
                            color: '#334155',
                            maxWidth: '100%',
                          }}
                        />
                      </TableCell>

                      {/* Shop Type */}
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569' }}>
                          {lead.shop_type || 'Retail'}
                        </Typography>
                      </TableCell>

                      {/* Status */}
                      <TableCell sx={{ py: 1 }}>
                        <Chip
                          label={lead.status}
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontSize: '0.7rem',
                            bgcolor: statusStyle.bg,
                            color: statusStyle.text,
                            border: `1px solid ${statusStyle.border}`,
                          }}
                        />
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="right" sx={{ py: 1 }} onClick={(e) => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                          <Tooltip title="View Profile">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenProfile(lead)}
                              sx={{ color: '#10b981', '&:hover': { bgcolor: '#ecfdf5' } }}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {onDirectMessage && (
                            <Tooltip title="Open Live Chat">
                              <IconButton
                                size="small"
                                onClick={() => onDirectMessage(lead.phone)}
                                sx={{ color: '#0284c7', '&:hover': { bgcolor: '#f0f9ff' } }}
                              >
                                <ChatIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edit Lead">
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEdit(lead)}
                              sx={{ color: '#64748b', '&:hover': { bgcolor: '#f8fafc' } }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteLead(lead.id, lead.shop_name)}
                              sx={{ '&:hover': { bgcolor: '#fef2f2' } }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>

      {/* ========================================================================= */}
      {/* 🌟 MODERNIZED LEAD PROFILE POPUP (Full Details & WhatsApp Quick Actions) */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(profileLead)}
        onClose={() => setProfileLead(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3.5,
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          },
        }}
      >
        {profileLead && (
          <>
            {/* Header Profile Hero Card */}
            <Box
              sx={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#ffffff',
                p: 3,
                position: 'relative',
              }}
            >
              <IconButton
                onClick={() => setProfileLead(null)}
                sx={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  color: '#94a3b8',
                  bgcolor: 'rgba(255,255,255,0.08)',
                  '&:hover': { color: '#ffffff', bgcolor: 'rgba(255,255,255,0.15)' },
                }}
              >
                <CloseIcon />
              </IconButton>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} sx={{ alignItems: { sm: 'center' } }}>
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  badgeContent={
                    profileLead.is_on_whatsapp ? (
                      <Tooltip title="Verified Active WhatsApp Account">
                        <CheckCircleIcon sx={{ color: '#25D366', fontSize: 24, bgcolor: '#ffffff', borderRadius: '50%' }} />
                      </Tooltip>
                    ) : null
                  }
                >
                  <Avatar
                    src={profileLead.whatsapp_profile_pic || undefined}
                    sx={{
                      width: 72,
                      height: 72,
                      bgcolor: '#10b981',
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      border: '3px solid rgba(255,255,255,0.2)',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                    }}
                  >
                    {profileLead.shop_name.charAt(0).toUpperCase()}
                  </Avatar>
                </Badge>

                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                      {profileLead.shop_name}
                    </Typography>
                    <Chip
                      label={profileLead.status}
                      size="small"
                      sx={{
                        fontWeight: 800,
                        fontSize: '0.7rem',
                        ...getStatusColor(profileLead.status),
                      }}
                    />
                  </Stack>

                  <Typography variant="body2" sx={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                    <PersonIcon fontSize="small" sx={{ color: '#38bdf8' }} />
                    {profileLead.owner_name ? `Contact: ${profileLead.owner_name}` : 'No Owner Specified'}
                  </Typography>

                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Chip
                      icon={<CategoryIcon sx={{ fontSize: '0.85rem !important', color: '#6ee7b7 !important' }} />}
                      label={profileLead.category || 'General'}
                      size="small"
                      sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 600 }}
                    />
                    <Chip
                      icon={<BusinessIcon sx={{ fontSize: '0.85rem !important', color: '#93c5fd !important' }} />}
                      label={profileLead.shop_type || 'Retail'}
                      size="small"
                      sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 600 }}
                    />
                  </Stack>
                </Box>
              </Stack>
            </Box>

            <DialogContent sx={{ p: 3, bgcolor: '#f8fafc' }}>
              <Grid container spacing={2.5}>
                {/* Left Column: Contact & Business Details */}
                <Grid item xs={12} md={7}>
                  {/* Phone & WhatsApp Intelligence Card */}
                  <Paper sx={{ p: 2.5, borderRadius: 2.5, mb: 2, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PhoneIcon fontSize="small" sx={{ color: '#10b981' }} /> Contact & WhatsApp Verification
                    </Typography>

                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', p: 1.5, bgcolor: '#f1f5f9', borderRadius: 2, mb: 1.5 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                          PHONE NUMBER
                        </Typography>
                        <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                          {profileLead.phone}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Tooltip title={copiedPhone ? 'Copied!' : 'Copy Phone'}>
                          <IconButton size="small" onClick={() => handleCopyPhone(profileLead.phone)} sx={{ bgcolor: '#ffffff' }}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Open in WhatsApp Web">
                          <IconButton
                            size="small"
                            onClick={() => window.open(`https://wa.me/${profileLead.phone.replace(/\D/g, '')}`, '_blank')}
                            sx={{ bgcolor: '#25D366', color: '#ffffff', '&:hover': { bgcolor: '#1eb857' } }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>

                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">WhatsApp Status:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: profileLead.is_on_whatsapp ? '#15803d' : '#b91c1c' }}>
                          {profileLead.is_on_whatsapp ? '✓ Verified WhatsApp Account' : '✕ Not on WhatsApp'}
                        </Typography>
                      </Box>
                      {profileLead.whatsapp_about && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">WhatsApp Bio:</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155', fontStyle: 'italic', textAlign: 'right', maxWidth: '65%' }}>
                            "{profileLead.whatsapp_about}"
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Paper>

                  {/* Location & Address Card */}
                  <Paper sx={{ p: 2.5, borderRadius: 2.5, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocationOnIcon fontSize="small" sx={{ color: '#ef4444' }} /> Location & Notes
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                        ADDRESS / DISTRICT
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b', mt: 0.5 }}>
                        {profileLead.address || 'No address provided.'}
                      </Typography>
                    </Box>

                    {profileLead.notes && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
                          INTERNAL NOTES & AI INTELLIGENCE
                        </Typography>
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#ffffff', borderRadius: 1.5, mt: 0.5 }}>
                          <Typography variant="body2" sx={{ color: '#475569', whiteSpace: 'pre-line', fontSize: '0.82rem' }}>
                            {profileLead.notes}
                          </Typography>
                        </Paper>
                      </Box>
                    )}
                  </Paper>
                </Grid>

                {/* Right Column: Quick WhatsApp Messenger & Profile Actions */}
                <Grid item xs={12} md={5}>
                  <Paper sx={{ p: 2.5, borderRadius: 2.5, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <WhatsAppIcon fontSize="small" sx={{ color: '#25D366' }} /> Quick WhatsApp Message
                    </Typography>

                    {quickMsgSuccess && (
                      <Alert severity="success" sx={{ mb: 1.5, py: 0.5, fontSize: '0.8rem' }}>
                        Message sent successfully via WhatsApp!
                      </Alert>
                    )}

                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      placeholder={`Type a quick message to ${profileLead.shop_name}...`}
                      value={quickMsg}
                      onChange={(e) => setQuickMsg(e.target.value)}
                      sx={{ bgcolor: '#ffffff', mb: 1.5 }}
                    />

                    <Button
                      fullWidth
                      variant="contained"
                      disabled={sendingQuickMsg || !quickMsg.trim()}
                      onClick={handleSendQuickMessage}
                      startIcon={sendingQuickMsg ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <SendIcon />}
                      sx={{
                        py: 1,
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#ffffff',
                        textTransform: 'none',
                        borderRadius: 2,
                        mb: 2,
                      }}
                    >
                      {sendingQuickMsg ? 'Sending...' : 'Send WhatsApp Message'}
                    </Button>

                    <Divider sx={{ my: 1 }} />

                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, mb: 1.5, display: 'block' }}>
                      MORE ACTIONS
                    </Typography>

                    <Stack spacing={1} sx={{ mt: 'auto' }}>
                      {onDirectMessage && (
                        <Button
                          fullWidth
                          variant="outlined"
                          startIcon={<ChatIcon />}
                          onClick={() => {
                            const p = profileLead.phone;
                            setProfileLead(null);
                            onDirectMessage(p);
                          }}
                          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                        >
                          Open in Full Live Chat
                        </Button>
                      )}
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<EditIcon />}
                        onClick={() => {
                          const l = profileLead;
                          setProfileLead(null);
                          handleOpenEdit(l);
                        }}
                        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, color: '#475569', borderColor: '#cbd5e1' }}
                      >
                        Edit Shop Information
                      </Button>
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            </DialogContent>

            <DialogActions sx={{ p: 2, bgcolor: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto', pl: 1 }}>
                Registered: {new Date(profileLead.created_at).toLocaleDateString()}
              </Typography>
              <Button onClick={() => setProfileLead(null)} sx={{ fontWeight: 700, color: '#64748b' }}>
                Close Profile
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ========================================================================= */}
      {/* 📝 ADD / EDIT LEAD MODAL */}
      {/* ========================================================================= */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800, bgcolor: '#0f172a', color: '#ffffff', display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorefrontIcon sx={{ color: '#10b981' }} />
          {editingLead ? 'Edit Lead Profile' : 'Add New Lead & Auto-Scan WhatsApp'}
        </DialogTitle>

        <DialogContent sx={{ pt: 3, mt: 1 }}>
          <Stack spacing={2.5}>
            {/* Phone Number + AI Scan */}
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', mb: 0.5, display: 'block' }}>
                PHONE NUMBER *
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="e.g. 01841774414"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (duplicateInfo) setDuplicateInfo(null);
                    if (waScanResult) setWaScanResult(null);
                  }}
                  onBlur={handlePhoneBlur}
                  helperText="Enter phone & click AI Scan to auto-discover shop info"
                />
                <Button
                  variant="contained"
                  onClick={handleScanWhatsApp}
                  disabled={scanningWa || !phone.trim()}
                  startIcon={scanningWa ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <AutoAwesomeIcon />}
                  sx={{
                    whiteSpace: 'nowrap',
                    py: 1,
                    px: 2,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    fontWeight: 700,
                    boxShadow: '0 3px 8px rgba(16, 185, 129, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    }
                  }}
                >
                  {scanningWa ? 'Scanning...' : '⚡ AI Scan & Auto-Fill'}
                </Button>
              </Stack>

              {/* Duplicate Warning */}
              {duplicateInfo?.is_duplicate && (
                <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mt: 1, py: 0.5 }}>
                  <strong>Duplicate Phone Found!</strong> Already registered as {duplicateInfo.type}: "{duplicateInfo.name}".
                </Alert>
              )}

              {/* WhatsApp Live Scan Info Badge */}
              {waScanResult?.scanned && (
                <Box
                  sx={{
                    mt: 1.5,
                    p: 1.5,
                    bgcolor: waScanResult.exists ? '#f0fdf4' : '#fff1f2',
                    border: `1px solid ${waScanResult.exists ? '#bbf7d0' : '#fecdd3'}`,
                    borderRadius: 2,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  }}
                >
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                    <Avatar
                      src={waScanResult.profilePictureUrl || undefined}
                      sx={{ width: 48, height: 48, bgcolor: '#10b981', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}
                    >
                      {shopName.charAt(0) || <StorefrontIcon />}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: waScanResult.exists ? '#15803d' : '#be123c' }}>
                          {waScanResult.exists ? '✓ Active WhatsApp Account' : '✕ Not found on WhatsApp'}
                        </Typography>
                        {waScanResult.sources_found?.map((src) => (
                          <Chip
                            key={src}
                            label={src}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              bgcolor: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #86efac'
                            }}
                          />
                        ))}
                      </Stack>
                      {waScanResult.about && (
                        <Typography variant="caption" sx={{ color: '#475569', display: 'block', fontStyle: 'italic' }}>
                          "{waScanResult.about}"
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Box>
              )}
            </Box>

            {/* Shop Name & Owner Name */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                size="small"
                label="Shop / Business Name *"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
              <TextField
                fullWidth
                size="small"
                label="Contact Person / Owner"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </Stack>

            {/* Category & Shop Type */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select
                  value={category}
                  label="Category"
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setOpenAddCategoryDialog(true);
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                >
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.name}>
                      {c.name}
                    </MenuItem>
                  ))}
                  <MenuItem value="__add_new__" sx={{ color: 'primary.main', fontWeight: 700 }}>
                    + Add New Category...
                  </MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Shop Type</InputLabel>
                <Select
                  value={shopType}
                  label="Shop Type"
                  onChange={(e) => setShopType(e.target.value)}
                >
                  {SHOP_TYPES.map((st) => (
                    <MenuItem key={st} value={st}>
                      {st}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Status */}
            <FormControl fullWidth size="small">
              <InputLabel>Lead Status</InputLabel>
              <Select
                value={status}
                label="Lead Status"
                onChange={(e) => setStatus(e.target.value)}
              >
                {LEAD_STATUSES.map((st) => (
                  <MenuItem key={st} value={st}>
                    {st}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Address */}
            <TextField
              fullWidth
              size="small"
              label="Address / District / Market Location"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />

            {/* Internal Notes */}
            <TextField
              fullWidth
              multiline
              rows={3}
              size="small"
              label="Internal Notes"
              placeholder="e.g. Inquired about wholesale discounts on Saturday..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2.5, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setOpenModal(false)} sx={{ fontWeight: 700, color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleSaveLead(false)}
            sx={{ fontWeight: 700, px: 3, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
          >
            {editingLead ? 'Save Changes' : 'Save Lead'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <Dialog open={showDupWarningDialog} onClose={() => setShowDupWarningDialog(false)}>
        <DialogTitle sx={{ fontWeight: 800, color: 'warning.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon /> Duplicate Phone Number
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            The phone number <strong>{phone}</strong> is already registered under:
          </Typography>
          <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#fef3c7', borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {duplicateInfo?.name} ({duplicateInfo?.type})
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Do you want to save this lead anyway?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShowDupWarningDialog(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={() => handleSaveLead(true)} sx={{ fontWeight: 700 }}>
            Save Anyway
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inline Create Category Dialog */}
      <Dialog open={openAddCategoryDialog} onClose={() => setOpenAddCategoryDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Add New Category</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="Category Name"
            placeholder="e.g. Cosmetics & Beauty"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenAddCategoryDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateCategory} sx={{ fontWeight: 700 }}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}