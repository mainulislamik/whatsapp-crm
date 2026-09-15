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
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { Lead, LeadCategory, LeadService } from '@/lib/api';

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

  // Live WhatsApp Scan State
  const [scanningWa, setScanningWa] = useState<boolean>(false);
  const [waScanResult, setWaScanResult] = useState<{
    scanned: boolean;
    connected: boolean;
    exists: boolean;
    name?: string | null;
    profilePictureUrl?: string | null;
    about?: string | null;
    businessProfile?: any;
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
      setLeads(leadsRes.data);
      setCategories(catsRes.data);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeadsAndCategories();
  }, [search, selectedCategory, selectedStatus]);

  // Handle checking duplicate when phone is changed / blurred
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

  // Live Scan Phone on WhatsApp
  const handleScanWhatsApp = async () => {
    const p = phone.trim();
    if (!p) {
      alert('Please enter a phone number first to scan on WhatsApp.');
      return;
    }
    setScanningWa(true);
    try {
      const res = await LeadService.scanWhatsApp(p);
      const data = res.data;
      const foundName = data.name || data.pushName || null;

      setWaScanResult({
        scanned: true,
        connected: data.connected,
        exists: data.exists,
        name: foundName,
        profilePictureUrl: data.profilePictureUrl,
        about: data.about,
        businessProfile: data.businessProfile,
      });

      if (data.exists) {
        if (foundName) {
          // Auto-populate Owner / Contact Person Name
          setOwnerName(foundName);
          // If shopName is currently empty, also prefill shopName with business name
          setShopName((prev) => (prev.trim() ? prev : foundName));
        }

        // Auto-populate address from business profile if address is empty
        if (data.businessProfile?.address) {
          const addr = data.businessProfile.address;
          setAddress((prev) => (prev.trim() ? prev : addr));
        }

        // Auto-populate notes from business description or WhatsApp about if notes is empty
        if (data.businessProfile?.description) {
          const desc = data.businessProfile.description;
          setNotes((prev) => (prev.trim() ? prev : desc));
        } else if (data.about) {
          const abt = `WhatsApp About: ${data.about}`;
          setNotes((prev) => (prev.trim() ? prev : abt));
        }
      }
    } catch (err: any) {
      alert('WhatsApp scan failed: ' + (err.message || 'Error'));
    } finally {
      setScanningWa(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingLead(null);
    setPhone('');
    setShopName('');
    setOwnerName('');
    setCategory(categories[0]?.name || 'General');
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
      profilePictureUrl: lead.whatsapp_profile_pic,
      about: lead.whatsapp_about,
    });
    setDuplicateInfo(null);
    setOpenModal(true);
  };

  const handleSaveLead = async (forceSave = false) => {
    if (!phone.trim() || !shopName.trim()) {
      alert('Phone number and Shop Name are required.');
      return;
    }

    // If not editing and duplicate is found and not forceSave, trigger warning dialog
    if (!editingLead && !forceSave) {
      try {
        const checkRes = await LeadService.checkPhone(phone.trim());
        if (checkRes.data.is_duplicate) {
          setDuplicateInfo(checkRes.data);
          setShowDupWarningDialog(true);
          return;
        }
      } catch (err) {}
    }

    try {
      if (editingLead) {
        await LeadService.update(editingLead.id, {
          phone: phone.trim(),
          shop_name: shopName.trim(),
          owner_name: ownerName.trim(),
          category,
          shop_type: shopType,
          status,
          address: address.trim(),
          notes: notes.trim(),
        });
      } else {
        await LeadService.create({
          phone: phone.trim(),
          shop_name: shopName.trim(),
          owner_name: ownerName.trim(),
          category,
          shop_type: shopType,
          status,
          address: address.trim(),
          notes: notes.trim(),
          force_save: forceSave,
        });
      }
      setOpenModal(false);
      setShowDupWarningDialog(false);
      fetchLeadsAndCategories();
    } catch (err: any) {
      if (err.response?.status === 409) {
        setDuplicateInfo(err.response?.data?.detail?.duplicate_info || { is_duplicate: true });
        setShowDupWarningDialog(true);
      } else {
        alert(err.response?.data?.detail || 'Failed to save lead');
      }
    }
  };

  const handleDeleteLead = async (id: number) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      await LeadService.delete(id);
      fetchLeadsAndCategories();
    } catch (err) {
      alert('Failed to delete lead');
    }
  };

  const handleCreateNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await LeadService.createCategory({ name });
      setCategory(name);
      setNewCategoryName('');
      setOpenAddCategoryDialog(false);
      const catsRes = await LeadService.listCategories();
      setCategories(catsRes.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create category');
    }
  };

  const getStatusColor = (st: string) => {
    switch (st) {
      case 'NEW':
        return 'info';
      case 'CONTACTED':
        return 'primary';
      case 'INTERESTED':
        return 'secondary';
      case 'QUALIFIED':
        return 'success';
      case 'LOST':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        {/* Header Title & Actions */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2.5, gap: 1.5 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
              <StorefrontIcon color="primary" /> Lead Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track shops, verify WhatsApp numbers, auto-fetch profile avatars, and manage customer leads.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => window.open(LeadService.getExportCsvUrl(), '_blank')}
            >
              Export CSV
            </Button>
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenAdd}
              sx={{ fontWeight: 700 }}
            >
              Add New Lead
            </Button>
          </Stack>
        </Stack>

        {/* Filters Bar */}
        <Box sx={{ mb: 2.5, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <TextField
              size="small"
              placeholder="Search by shop name, owner, phone, or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
              sx={{ flexGrow: 1, bgcolor: '#ffffff' }}
            />

            <FormControl size="small" sx={{ minWidth: 160, bgcolor: '#ffffff' }}>
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

            <FormControl size="small" sx={{ minWidth: 140, bgcolor: '#ffffff' }}>
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

            <IconButton size="small" onClick={fetchLeadsAndCategories} sx={{ color: 'text.secondary' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>

        {loading && <LinearProgress sx={{ mb: 1.5 }} />}

        {/* Modern Leads Table */}
        <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Shop & Profile</TableCell>
                <TableCell>Phone / WhatsApp</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Shop Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Address / Notes</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No leads found. Click "Add New Lead" to register a shop.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id} hover>
                    <TableCell>
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
                            }}
                          >
                            {lead.shop_name.charAt(0).toUpperCase()}
                          </Avatar>
                        </Badge>
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            {lead.shop_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {lead.owner_name ? `Owner: ${lead.owner_name}` : '—'}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {lead.phone}
                      </Typography>
                      {lead.is_on_whatsapp ? (
                        <Chip
                          icon={<WhatsAppIcon sx={{ fontSize: '0.85rem !important' }} />}
                          label="On WhatsApp"
                          size="small"
                          color="success"
                          variant="outlined"
                          sx={{ fontSize: '0.68rem', height: 20 }}
                        />
                      ) : (
                        <Chip
                          label="Unverified"
                          size="small"
                          color="default"
                          variant="outlined"
                          sx={{ fontSize: '0.68rem', height: 20 }}
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      <Chip label={lead.category || 'General'} size="small" sx={{ fontWeight: 600 }} />
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem' }}>
                        {lead.shop_type || '—'}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={lead.status}
                        color={getStatusColor(lead.status) as any}
                        size="small"
                        sx={{ fontWeight: 700, fontSize: '0.72rem' }}
                      />
                    </TableCell>

                    <TableCell sx={{ maxWidth: 200, fontSize: '0.82rem', color: 'text.secondary' }}>
                      {lead.address || lead.notes ? (
                        <Box>
                          {lead.address && <div>📍 {lead.address}</div>}
                          {lead.notes && <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>📝 {lead.notes}</div>}
                        </Box>
                      ) : (
                        '—'
                      )}
                    </TableCell>

                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        {onDirectMessage && (
                          <Tooltip title="Send WhatsApp Message">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => onDirectMessage(lead.phone)}
                            >
                              <ChatIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Edit Lead">
                          <IconButton size="small" color="secondary" onClick={() => handleOpenEdit(lead)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Lead">
                          <IconButton size="small" color="error" onClick={() => handleDeleteLead(lead.id)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Add / Edit Lead Dialog */}
        <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 800 }}>
            {editingLead ? 'Edit Lead' : 'Add New Lead & Auto-Scan WhatsApp'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.2} sx={{ mt: 1 }}>
              {/* Phone Field with Live WhatsApp Scan & Duplicate Check */}
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <TextField
                    label="Phone Number *"
                    placeholder="e.g. 01700000000 or 88017..."
                    fullWidth
                    size="small"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setWaScanResult(null);
                    }}
                    onBlur={handlePhoneBlur}
                    helperText="Will auto-check duplicate and scan WhatsApp"
                  />
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={handleScanWhatsApp}
                    disabled={scanningWa || !phone.trim()}
                    startIcon={scanningWa ? <CircularProgress size={16} /> : <QrCodeScannerIcon />}
                    sx={{ whiteSpace: 'nowrap', py: 0.9 }}
                  >
                    Scan WA
                  </Button>
                </Stack>

                {/* Duplicate Warning indicator below input */}
                {duplicateInfo?.is_duplicate && (
                  <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mt: 1, py: 0.5, fontSize: '0.82rem' }}>
                    <strong>Warning:</strong> Phone already exists in {duplicateInfo.type} (
                    <strong>{duplicateInfo.name}</strong>).
                  </Alert>
                )}

                {/* WhatsApp Live Scan Result Box */}
                {waScanResult && (
                  <Box
                    sx={{
                      mt: 1.5,
                      p: 1.5,
                      bgcolor: waScanResult.exists ? '#f0fdf4' : '#fff1f2',
                      border: `1px solid ${waScanResult.exists ? '#bbf7d0' : '#fecdd3'}`,
                      borderRadius: 1.5,
                    }}
                  >
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Avatar
                        src={waScanResult.profilePictureUrl || undefined}
                        sx={{ width: 44, height: 44, bgcolor: '#128C7E' }}
                      >
                        {shopName.charAt(0) || 'W'}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: waScanResult.exists ? '#15803d' : '#be123c' }}>
                          {waScanResult.exists ? '✓ Active on WhatsApp' : '✕ Not found on WhatsApp'}
                        </Typography>
                        {waScanResult.name && (
                          <Typography variant="caption" sx={{ color: '#047857', fontWeight: 700, display: 'block' }}>
                            ✓ Name found: <strong>"{waScanResult.name}"</strong> (Auto-filled below)
                          </Typography>
                        )}
                        {waScanResult.profilePictureUrl && (
                          <Typography variant="caption" sx={{ color: '#15803d', display: 'block' }}>
                            ✓ Profile photo collected successfully!
                          </Typography>
                        )}
                        {waScanResult.about && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            About: "{waScanResult.about}"
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </Box>
                )}
              </Box>

              <TextField
                label="Shop / Business Name *"
                placeholder="e.g. Bhai Bhai Fashion, City Super Shop..."
                fullWidth
                size="small"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                helperText={waScanResult?.name && shopName === waScanResult.name ? 'Auto-suggested from WhatsApp Business Name' : undefined}
              />

              <TextField
                label="Owner / Contact Person Name"
                placeholder="e.g. Md. Karim"
                fullWidth
                size="small"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                helperText={waScanResult?.name ? 'Auto-filled from WhatsApp Profile Name' : undefined}
                FormHelperTextProps={{ sx: { color: '#059669', fontWeight: 600 } }}
              />

              {/* Category selector + Add New Category option */}
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={category}
                      label="Category"
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {categories.map((c) => (
                        <MenuItem key={c.id} value={c.name}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setOpenAddCategoryDialog(true)}
                    sx={{ whiteSpace: 'nowrap', py: 0.9 }}
                  >
                    + New
                  </Button>
                </Stack>
              </Box>

              {/* Shop Type and Status */}
              <Stack direction="row" spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Shop Type</InputLabel>
                  <Select
                    value={shopType}
                    label="Shop Type"
                    onChange={(e) => setShopType(e.target.value)}
                  >
                    {SHOP_TYPES.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={status}
                    label="Status"
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {LEAD_STATUSES.map((st) => (
                      <MenuItem key={st} value={st}>
                        {st}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <TextField
                label="Shop Address / Location"
                placeholder="e.g. Shop #12, New Market, Dhaka"
                fullWidth
                size="small"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />

              <TextField
                label="Internal Notes"
                placeholder="Key requirements, conversation notes, etc."
                fullWidth
                multiline
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setOpenModal(false)}>Cancel</Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleSaveLead(false)}
              sx={{ fontWeight: 700 }}
            >
              {editingLead ? 'Update Lead' : 'Save Lead'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Duplicate Warning Modal if Contact Already Exists */}
        <Dialog open={showDupWarningDialog} onClose={() => setShowDupWarningDialog(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 800, color: 'warning.main', display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningAmberIcon color="warning" /> Contact Already Exists!
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              A record with phone number <strong>{phone}</strong> is already present in your{' '}
              <strong>{duplicateInfo?.type || 'system'}</strong> under the name:
            </Typography>
            <Alert severity="info" sx={{ fontWeight: 600 }}>
              {duplicateInfo?.name} ({phone})
            </Alert>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Do you still want to add this lead or cancel?
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setShowDupWarningDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              color="warning"
              onClick={() => handleSaveLead(true)}
              sx={{ fontWeight: 700 }}
            >
              Force Save Anyway
            </Button>
          </DialogActions>
        </Dialog>

        {/* Inline Add New Category Dialog */}
        <Dialog open={openAddCategoryDialog} onClose={() => setOpenAddCategoryDialog(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Add New Category</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              label="Category Name *"
              placeholder="e.g. Footwear, Bakery, Cosmetics..."
              fullWidth
              size="small"
              sx={{ mt: 1 }}
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenAddCategoryDialog(false)}>Cancel</Button>
            <Button variant="contained" color="primary" onClick={handleCreateNewCategory}>
              Add Category
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
