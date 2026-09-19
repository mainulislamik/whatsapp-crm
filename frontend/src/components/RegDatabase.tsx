'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  Button,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tabs,
  Tab,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Chat as ChatIcon,
  Add as AddIcon,
  Storage as StorageIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  HourglassEmpty as HourglassIcon,
  SmartToy as SmartToyIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  Store as StoreIcon,
} from '@mui/icons-material';
import { RegDbService, RegShop, RegPending } from '@/lib/api';

interface RegDatabaseProps {
  onDirectMessage: (phone: string) => void;
}

export default function RegDatabase({ onDirectMessage }: RegDatabaseProps) {
  const [tab, setTab] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [shops, setShops] = useState<RegShop[]>([]);
  const [pending, setPending] = useState<RegPending[]>([]);
  const [stats, setStats] = useState({
    total_shops: 0,
    active_shops: 0,
    customized_count: 0,
  });

  // Filters
  const [search, setSearch] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Customize Dialog State
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const [selectedShop, setSelectedShop] = useState<RegShop | null>(null);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [aiInstructions, setAiInstructions] = useState<string>('');
  const [customWaPhone, setCustomWaPhone] = useState<string>('');
  const [tagsInput, setTagsInput] = useState<string>('');
  const [savingCustom, setSavingCustom] = useState<boolean>(false);

  // Manual Shop Dialog State
  const [manualDialogOpen, setManualDialogOpen] = useState<boolean>(false);
  const [manualShopName, setManualShopName] = useState<string>('');
  const [manualOwnerName, setManualOwnerName] = useState<string>('');
  const [manualPhone, setManualPhone] = useState<string>('');
  const [manualCategory, setManualCategory] = useState<string>('grocery');
  const [manualPlan, setManualPlan] = useState<string>('Opening Offer 6 Months');
  const [manualNotes, setManualNotes] = useState<string>('');
  const [manualAiInstructions, setManualAiInstructions] = useState<string>('');
  const [savingManual, setSavingManual] = useState<boolean>(false);

  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [shopsRes, pendingRes] = await Promise.all([
        RegDbService.getShops({
          search: search.trim() || undefined,
          plan: planFilter !== 'all' ? planFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        }),
        RegDbService.getPending(),
      ]);

      setShops(shopsRes.data.shops || []);
      setStats({
        total_shops: shopsRes.data.total_shops || 0,
        active_shops: shopsRes.data.active_shops || 0,
        customized_count: shopsRes.data.customized_count || 0,
      });
      setPending(pendingRes.data || []);
    } catch (e: any) {
      console.error('Failed to load Reg DB data:', e);
      setAlertMsg({ type: 'error', text: 'Failed to fetch StockWhisk registration data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [planFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  // Open Edit Customization Dialog
  const handleOpenEdit = (shop: RegShop) => {
    setSelectedShop(shop);
    setCustomNotes(shop.custom_notes || '');
    setAiInstructions(shop.ai_instructions || '');
    setCustomWaPhone(shop.custom_whatsapp_phone || '');
    setTagsInput((shop.tags || []).join(', '));
    setEditDialogOpen(true);
  };

  // Save Customization
  const handleSaveCustom = async () => {
    if (!selectedShop) return;
    setSavingCustom(true);
    try {
      const tagsArray = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await RegDbService.saveShopCustom(selectedShop.id, {
        custom_notes: customNotes,
        ai_instructions: aiInstructions,
        custom_whatsapp_phone: customWaPhone,
        tags: tagsArray,
      });

      setAlertMsg({ type: 'success', text: `Saved custom information for "${selectedShop.name}"!` });
      setEditDialogOpen(false);
      loadData();
    } catch (e: any) {
      console.error('Failed to save customization:', e);
      setAlertMsg({ type: 'error', text: 'Could not save customization.' });
    } finally {
      setSavingCustom(false);
    }
  };

  // Save Manual Shop Entry
  const handleSaveManual = async () => {
    if (!manualShopName.trim() || !manualPhone.trim()) {
      setAlertMsg({ type: 'error', text: 'Shop Name and Phone Number are required.' });
      return;
    }
    setSavingManual(true);
    try {
      await RegDbService.saveManualShop({
        shop_name: manualShopName.trim(),
        owner_name: manualOwnerName.trim(),
        phone: manualPhone.trim(),
        business_type: manualCategory,
        plan_name: manualPlan,
        is_active: true,
        custom_notes: manualNotes.trim(),
        ai_instructions: manualAiInstructions.trim(),
        tags: ['Manual Entry'],
      });

      setAlertMsg({ type: 'success', text: `Added "${manualShopName}" to Registration Database!` });
      setManualDialogOpen(false);
      // Reset form
      setManualShopName('');
      setManualOwnerName('');
      setManualPhone('');
      setManualNotes('');
      setManualAiInstructions('');
      loadData();
    } catch (e: any) {
      console.error('Failed to add manual shop:', e);
      setAlertMsg({ type: 'error', text: 'Could not add manual shop entry.' });
    } finally {
      setSavingManual(false);
    }
  };

  // Delete Manual Entry
  const handleDeleteManual = async (manualId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove the manual record for "${name}"?`)) return;
    try {
      await RegDbService.deleteManualShop(manualId);
      setAlertMsg({ type: 'success', text: `Removed manual shop "${name}".` });
      loadData();
    } catch (e: any) {
      console.error('Failed to delete manual shop:', e);
      setAlertMsg({ type: 'error', text: 'Could not delete manual shop.' });
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, margin: '0 auto' }}>
      {/* Alert message */}
      {alertMsg && (
        <Alert
          severity={alertMsg.type}
          onClose={() => setAlertMsg(null)}
          sx={{ mb: 2.5, borderRadius: 2 }}
        >
          {alertMsg.text}
        </Alert>
      )}

      {/* Top Header Card */}
      <Card
        sx={{
          mb: 3,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          borderRadius: 3,
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ md: 'center' }}
            gap={2}
          >
            <Box>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.8 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 2,
                    bgcolor: 'rgba(2, 132, 199, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <StorageIcon sx={{ color: '#38bdf8', fontSize: 26 }} />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#ffffff' }}>
                    StockWhisk Registration Database
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                    Live read-only sync with StockWhisk PostgreSQL DB • Customize shop metadata & AI Bot instructions
                  </Typography>
                </Box>
              </Stack>
            </Box>

            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={loadData}
                disabled={loading}
                sx={{
                  color: '#ffffff',
                  borderColor: 'rgba(255,255,255,0.2)',
                  fontWeight: 600,
                  '&:hover': { borderColor: '#ffffff', bgcolor: 'rgba(255,255,255,0.05)' },
                }}
              >
                Sync DB
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setManualDialogOpen(true)}
                sx={{
                  bgcolor: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 700,
                  '&:hover': { bgcolor: '#0369a1' },
                }}
              >
                + Add Customer Record
              </Button>
            </Stack>
          </Stack>

          {/* Quick Metrics Bar */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: 2,
              mt: 3,
              pt: 2.5,
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Box>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                TOTAL REGISTERED SHOPS
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#ffffff', mt: 0.3 }}>
                {stats.total_shops}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                ACTIVE SHOPS
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#4ade80', mt: 0.3 }}>
                {stats.active_shops}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                CUSTOMIZED BY OPERATOR
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#38bdf8', mt: 0.3 }}>
                {stats.customized_count}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                PENDING REGISTRATIONS (OTP)
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#fbbf24', mt: 0.3 }}>
                {pending.length}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card sx={{ mb: 3, borderRadius: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={tab} onChange={(_, val) => setTab(val)}>
            <Tab
              icon={<StoreIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={`Registered Shops (${shops.length})`}
              sx={{ fontWeight: 700, textTransform: 'none' }}
            />
            <Tab
              icon={<HourglassIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              label={`Pending Registrations (${pending.length})`}
              sx={{ fontWeight: 700, textTransform: 'none' }}
            />
          </Tabs>
        </Box>

        {/* Tab 0: Registered Shops */}
        {tab === 0 && (
          <Box sx={{ p: 2.5 }}>
            {/* Filter & Search Bar */}
            <form onSubmit={handleSearchSubmit}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                sx={{ mb: 2.5 }}
                alignItems="center"
              >
                <TextField
                  size="small"
                  placeholder="Search by shop name, owner, phone, slug..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: '#64748b' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 280 } }}
                />

                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel>Subscription Plan</InputLabel>
                  <Select
                    value={planFilter}
                    label="Subscription Plan"
                    onChange={(e) => setPlanFilter(e.target.value)}
                  >
                    <MenuItem value="all">All Plans</MenuItem>
                    <MenuItem value="Opening Offer 6 Months">Opening Offer 6 Months</MenuItem>
                    <MenuItem value="Customized">Customized / Enterprise</MenuItem>
                    <MenuItem value="Standard">Standard</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={statusFilter}
                    label="Status"
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <MenuItem value="all">All Status</MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                  </Select>
                </FormControl>

                <Button
                  type="submit"
                  variant="contained"
                  sx={{
                    bgcolor: '#0f172a',
                    fontWeight: 700,
                    px: 3,
                    '&:hover': { bgcolor: '#1e293b' },
                  }}
                >
                  Filter
                </Button>
              </Stack>
            </form>

            {/* Table */}
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : shops.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6, color: '#64748b' }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  No registered shops match the criteria.
                </Typography>
                <Typography variant="caption">
                  Try clearing your search or filter to see all shops.
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
                <Table sx={{ minWidth: 700 }}>
                  <TableHead sx={{ bgcolor: '#f8fafc' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>SHOP & SOURCE</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>CONTACT & WHATSAPP</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>CATEGORY</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>PLAN TIER</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>CUSTOM NOTES & AI INSTRUCTIONS</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>STATUS</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>ACTIONS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shops.map((shop) => (
                      <TableRow
                        key={String(shop.id)}
                        sx={{
                          '&:hover': { bgcolor: '#f8fafc' },
                          bgcolor: shop.customized ? '#f0fdf4' : 'inherit',
                        }}
                      >
                        {/* Shop Name & Source */}
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                                {shop.name}
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                slug: {shop.slug || '—'}
                              </Typography>
                            </Box>
                            {shop.is_manual ? (
                              <Chip
                                size="small"
                                label="Manual Entry"
                                color="warning"
                                variant="outlined"
                                sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                              />
                            ) : (
                              <Chip
                                size="small"
                                label="Postgres Live"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
                              />
                            )}
                          </Stack>
                        </TableCell>

                        {/* Contact & WhatsApp */}
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                            {shop.phone || '—'}
                          </Typography>
                          {shop.custom_whatsapp_phone && shop.custom_whatsapp_phone !== shop.phone && (
                            <Typography variant="caption" sx={{ color: '#059669', display: 'block' }}>
                              WA: {shop.custom_whatsapp_phone}
                            </Typography>
                          )}
                          {shop.email && (
                            <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                              {shop.email}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Category */}
                        <TableCell>
                          <Chip
                            size="small"
                            label={shop.business_type || 'Retail'}
                            sx={{ fontWeight: 600, fontSize: 11, textTransform: 'capitalize' }}
                          />
                        </TableCell>

                        {/* Plan Tier */}
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0284c7' }}>
                            {shop.plan_name || 'Standard'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', textTransform: 'capitalize' }}>
                            Tier: {shop.plan_tier || 'active'}
                          </Typography>
                        </TableCell>

                        {/* Custom Notes & AI Instructions */}
                        <TableCell sx={{ maxWidth: 260 }}>
                          {shop.custom_notes || shop.ai_instructions ? (
                            <Box>
                              {shop.custom_notes && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    fontWeight: 600,
                                    color: '#0f172a',
                                  }}
                                >
                                  📝 {shop.custom_notes}
                                </Typography>
                              )}
                              {shop.ai_instructions && (
                                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }}>
                                  <SmartToyIcon sx={{ fontSize: 13, color: '#7c3aed' }} />
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      display: '-webkit-box',
                                      WebkitLineClamp: 1,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                      color: '#7c3aed',
                                      fontWeight: 600,
                                    }}
                                  >
                                    AI: {shop.ai_instructions}
                                  </Typography>
                                </Stack>
                              )}
                              {shop.tags && shop.tags.length > 0 && (
                                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                                  {shop.tags.map((t, idx) => (
                                    <Chip
                                      key={idx}
                                      label={t}
                                      size="small"
                                      sx={{ height: 18, fontSize: 9, fontWeight: 700 }}
                                    />
                                  ))}
                                </Stack>
                              )}
                            </Box>
                          ) : (
                            <Typography variant="caption" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                              No custom notes set.
                            </Typography>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {shop.is_active ? (
                            <Chip
                              size="small"
                              icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                              label="Active"
                              color="success"
                              sx={{ fontWeight: 700, fontSize: 11 }}
                            />
                          ) : (
                            <Chip
                              size="small"
                              icon={<CancelIcon sx={{ fontSize: '14px !important' }} />}
                              label="Inactive"
                              color="error"
                              sx={{ fontWeight: 700, fontSize: 11 }}
                            />
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.8} justifyContent="flex-end">
                            <Tooltip title="Customize Notes & AI Instructions">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleOpenEdit(shop)}
                                sx={{ bgcolor: '#eff6ff', '&:hover': { bgcolor: '#dbeafe' } }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {shop.phone && (
                              <Tooltip title="Send WhatsApp Message">
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => onDirectMessage(shop.custom_whatsapp_phone || shop.phone)}
                                  sx={{ bgcolor: '#f0fdf4', '&:hover': { bgcolor: '#dcfce7' } }}
                                >
                                  <ChatIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {shop.is_manual && (
                              <Tooltip title="Delete Manual Entry">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteManual(String(shop.id), shop.name)}
                                  sx={{ bgcolor: '#fef2f2', '&:hover': { bgcolor: '#fee2e2' } }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* Tab 1: Pending Registrations */}
        {tab === 1 && (
          <Box sx={{ p: 2.5 }}>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
              These customers started the StockWhisk registration form but have not completed OTP verification or store activation yet.
            </Typography>

            {pending.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6, color: '#64748b' }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  No pending registrations at the moment.
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
                <Table>
                  <TableHead sx={{ bgcolor: '#f8fafc' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>SHOP & OWNER</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>PHONE</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>EMAIL</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>CATEGORY</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>REGISTRATION DATE</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#475569', fontSize: 12 }}>ACTIONS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pending.map((p) => (
                      <TableRow key={p.id} sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                        <TableCell>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            {p.shop_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            Owner: {p.owner_name || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {p.phone}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: '#64748b' }}>
                            {p.email || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={p.business_type || 'General'}
                            sx={{ fontWeight: 600, fontSize: 11, textTransform: 'capitalize' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            startIcon={<ChatIcon />}
                            onClick={() => onDirectMessage(p.phone)}
                            sx={{ fontWeight: 700, fontSize: 11 }}
                          >
                            Follow up
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Card>

      {/* Customize Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pb: 1 }}>
          Customize Shop & AI Instructions
        </DialogTitle>
        <DialogContent dividers>
          {selectedShop && (
            <Stack spacing={2.5}>
              <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {selectedShop.name}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  StockWhisk Registered Phone: {selectedShop.phone || 'None'} • Plan: {selectedShop.plan_name}
                </Typography>
              </Box>

              {/* Custom WhatsApp Phone Override */}
              <TextField
                label="Custom WhatsApp Number (if owner messages from different number)"
                value={customWaPhone}
                onChange={(e) => setCustomWaPhone(e.target.value)}
                placeholder="e.g. 01711000020"
                fullWidth
                size="small"
                helperText="If the customer uses a different WhatsApp number than their StockWhisk signup phone, set it here."
              />

              {/* Custom Operator Notes */}
              <TextField
                label="Custom Operator Notes (Internal CRM Notes)"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="e.g. VIP client, using Sunmi V2s POS, needs scale barcode help..."
                multiline
                rows={2}
                fullWidth
                size="small"
                helperText="These notes will be displayed in LiveChat and customer records."
              />

              {/* AI Instructions */}
              <TextField
                label="Special Instructions for AI Bot (Behavior Override)"
                value={aiInstructions}
                onChange={(e) => setAiInstructions(e.target.value)}
                placeholder="e.g. Offer 10% discount on yearly renewal; prioritize fast POS feature; answer in concise style."
                multiline
                rows={3}
                fullWidth
                size="small"
                helperText="The AI Bot will automatically follow these specific instructions when talking to this customer!"
              />

              {/* Tags */}
              <TextField
                label="Tags (comma-separated)"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="VIP, SuperShop, Scale Barcode, Priority"
                fullWidth
                size="small"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)} sx={{ fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveCustom}
            disabled={savingCustom}
            sx={{ bgcolor: '#0f172a', fontWeight: 700, '&:hover': { bgcolor: '#1e293b' } }}
          >
            {savingCustom ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manual Shop Entry Dialog */}
      <Dialog
        open={manualDialogOpen}
        onClose={() => setManualDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pb: 1 }}>
          + Add Customer / Shop Record
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            Add an offline customer, manual agreement, or lead directly into the CRM Registration Database. The AI bot will recognize this shop immediately.
          </Typography>

          <Stack spacing={2}>
            <TextField
              label="Shop Name *"
              value={manualShopName}
              onChange={(e) => setManualShopName(e.target.value)}
              placeholder="e.g. Dhaka Grocery & General Store"
              fullWidth
              size="small"
              required
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Owner / Contact Name"
                value={manualOwnerName}
                onChange={(e) => setManualOwnerName(e.target.value)}
                placeholder="e.g. Md. Rahim"
                fullWidth
                size="small"
              />
              <TextField
                label="Phone Number *"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                placeholder="e.g. 01712345678"
                fullWidth
                size="small"
                required
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Category / Business Type</InputLabel>
                <Select
                  value={manualCategory}
                  label="Category / Business Type"
                  onChange={(e) => setManualCategory(e.target.value)}
                >
                  <MenuItem value="grocery">Grocery & Super Shop</MenuItem>
                  <MenuItem value="electronics">Electronics & Mobile</MenuItem>
                  <MenuItem value="fashion">Fashion & Clothing</MenuItem>
                  <MenuItem value="pharmacy">Pharmacy & Healthcare</MenuItem>
                  <MenuItem value="restaurant">Restaurant & Cafe</MenuItem>
                  <MenuItem value="general">General Retail</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Plan Tier</InputLabel>
                <Select
                  value={manualPlan}
                  label="Plan Tier"
                  onChange={(e) => setManualPlan(e.target.value)}
                >
                  <MenuItem value="Opening Offer 6 Months">Opening Offer 6 Months (৳499/mo)</MenuItem>
                  <MenuItem value="Customized">Customized / Enterprise (৳999/mo)</MenuItem>
                  <MenuItem value="Standard">Standard</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <TextField
              label="Custom Notes (Internal)"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="e.g. Agreement signed via WhatsApp, manual bKash payment..."
              multiline
              rows={2}
              fullWidth
              size="small"
            />

            <TextField
              label="AI Bot Special Instructions"
              value={manualAiInstructions}
              onChange={(e) => setManualAiInstructions(e.target.value)}
              placeholder="e.g. Treat as verified customer, offer assistance with scale barcode setup..."
              multiline
              rows={2}
              fullWidth
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setManualDialogOpen(false)} sx={{ fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveManual}
            disabled={savingManual}
            sx={{ bgcolor: '#0284c7', fontWeight: 700, '&:hover': { bgcolor: '#0369a1' } }}
          >
            {savingManual ? 'Adding...' : 'Add Record'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
