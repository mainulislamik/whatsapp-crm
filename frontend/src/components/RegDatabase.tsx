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
  Tooltip,
  CircularProgress,
  Tabs,
  Tab,
  Alert,
  Switch,
  FormControlLabel,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Divider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import StorageIcon from '@mui/icons-material/Storage';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon from '@mui/icons-material/Pending';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import StorefrontIcon from '@mui/icons-material/Storefront';

import { RegDbService, RegShop, RegPending, QARule } from '@/lib/api';

interface RegDatabaseProps {
  onDirectMessage?: (phone: string) => void;
}

export default function RegDatabase({ onDirectMessage }: RegDatabaseProps) {
  const [activeTab, setActiveTab] = useState<number>(0); // 0: Q&A Rules, 1: Shops, 2: Pending
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Q&A Rules State
  const [qaRules, setQaRules] = useState<QARule[]>([]);
  const [qaSearch, setQaSearch] = useState<string>('');
  const [qaCategoryFilter, setQaCategoryFilter] = useState<string>('All');
  const [qaModalOpen, setQaModalOpen] = useState<boolean>(false);
  const [editingQaRule, setEditingQaRule] = useState<Partial<QARule> | null>(null);
  const [qaSaving, setQaSaving] = useState<boolean>(false);

  // Shops State
  const [shops, setShops] = useState<RegShop[]>([]);
  const [totalShops, setTotalShops] = useState<number>(0);
  const [activeShops, setActiveShops] = useState<number>(0);
  const [customizedCount, setCustomizedCount] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Pending State
  const [pendingList, setPendingList] = useState<RegPending[]>([]);

  // Shop Modals
  const [customModalOpen, setCustomModalOpen] = useState<boolean>(false);
  const [selectedShop, setSelectedShop] = useState<RegShop | null>(null);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [aiInstructions, setAiInstructions] = useState<string>('');
  const [customWaPhone, setCustomWaPhone] = useState<string>('');
  const [tagsInput, setTagsInput] = useState<string>('');
  const [savingCustom, setSavingCustom] = useState<boolean>(false);

  // Manual Shop Modal
  const [manualModalOpen, setManualModalOpen] = useState<boolean>(false);
  const [manualForm, setManualForm] = useState({
    shop_name: '',
    owner_name: '',
    phone: '',
    business_type: 'general',
    plan_name: 'Opening Offer 6 Months',
    is_active: true,
    custom_notes: '',
    ai_instructions: '',
    tags: '',
  });
  const [savingManual, setSavingManual] = useState<boolean>(false);

  const loadData = async () => {
    try {
      setError(null);
      const [shopsRes, pendingRes, qaRes] = await Promise.all([
        RegDbService.getShops({
          search: searchTerm || undefined,
          plan: planFilter !== 'All' ? planFilter : undefined,
          status: statusFilter !== 'All' ? statusFilter : undefined,
        }),
        RegDbService.getPending(),
        RegDbService.getQARules(),
      ]);

      setShops(shopsRes.data.shops || []);
      setTotalShops(shopsRes.data.total_shops || 0);
      setActiveShops(shopsRes.data.active_shops || 0);
      setCustomizedCount(shopsRes.data.customized_count || 0);
      setPendingList(pendingRes.data || []);
      setQaRules(qaRes.data || []);
    } catch (err: any) {
      console.error('Failed to load Reg DB data:', err);
      setError('Failed to fetch data from backend. Please verify that wa-backend is running.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [planFilter, statusFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Q&A Handlers
  const handleOpenAddQa = () => {
    setEditingQaRule({
      id: '',
      question: '',
      keywords: [],
      answer: '',
      category: 'General',
      is_active: true,
    });
    setQaModalOpen(true);
  };

  const handleOpenEditQa = (rule: QARule) => {
    setEditingQaRule({ ...rule });
    setQaModalOpen(true);
  };

  const handleSaveQaRule = async () => {
    if (!editingQaRule || !editingQaRule.question || !editingQaRule.answer) return;
    setQaSaving(true);
    try {
      await RegDbService.saveQARule(editingQaRule);
      setQaModalOpen(false);
      setEditingQaRule(null);
      const res = await RegDbService.getQARules();
      setQaRules(res.data || []);
    } catch (err) {
      console.error('Failed to save QA rule:', err);
      alert('Failed to save Q&A rule. Please try again.');
    } finally {
      setQaSaving(false);
    }
  };

  const handleDeleteQaRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this Q&A rule?')) return;
    try {
      await RegDbService.deleteQARule(ruleId);
      setQaRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      console.error('Failed to delete QA rule:', err);
    }
  };

  const handleToggleQaRuleActive = async (rule: QARule) => {
    try {
      const updated = { ...rule, is_active: !rule.is_active };
      await RegDbService.saveQARule(updated);
      setQaRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch (err) {
      console.error('Failed to toggle QA rule status:', err);
    }
  };

  // Shop Customization Handlers
  const handleOpenCustomDialog = (shop: RegShop) => {
    setSelectedShop(shop);
    setCustomNotes(shop.custom_notes || '');
    setAiInstructions(shop.ai_instructions || '');
    setCustomWaPhone(shop.custom_whatsapp_phone || '');
    setTagsInput((shop.tags || []).join(', '));
    setCustomModalOpen(true);
  };

  const handleSaveCustom = async () => {
    if (!selectedShop) return;
    setSavingCustom(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await RegDbService.saveShopCustom(selectedShop.id, {
        custom_notes: customNotes,
        ai_instructions: aiInstructions,
        custom_whatsapp_phone: customWaPhone,
        tags,
      });

      setCustomModalOpen(false);
      setSelectedShop(null);
      loadData();
    } catch (err) {
      console.error('Failed to save custom shop details:', err);
      alert('Failed to save custom details.');
    } finally {
      setSavingCustom(false);
    }
  };

  const handleSaveManual = async () => {
    if (!manualForm.shop_name || !manualForm.phone) {
      alert('Please fill in Shop Name and Phone Number.');
      return;
    }
    setSavingManual(true);
    try {
      const tags = manualForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await RegDbService.saveManualShop({
        shop_name: manualForm.shop_name,
        owner_name: manualForm.owner_name,
        phone: manualForm.phone,
        business_type: manualForm.business_type,
        plan_name: manualForm.plan_name,
        is_active: manualForm.is_active,
        custom_notes: manualForm.custom_notes,
        ai_instructions: manualForm.ai_instructions,
        tags,
      });

      setManualModalOpen(false);
      setManualForm({
        shop_name: '',
        owner_name: '',
        phone: '',
        business_type: 'general',
        plan_name: 'Opening Offer 6 Months',
        is_active: true,
        custom_notes: '',
        ai_instructions: '',
        tags: '',
      });
      loadData();
    } catch (err) {
      console.error('Failed to save manual shop:', err);
      alert('Failed to save manual registration record.');
    } finally {
      setSavingManual(false);
    }
  };

  const handleDeleteManual = async (manualId: string) => {
    if (!confirm('Are you sure you want to remove this manual shop record?')) return;
    try {
      await RegDbService.deleteManualShop(manualId);
      loadData();
    } catch (err) {
      console.error('Failed to delete manual shop:', err);
    }
  };

  // Filter Q&A Rules
  const filteredQaRules = qaRules.filter((r) => {
    const matchesCat = qaCategoryFilter === 'All' || r.category === qaCategoryFilter;
    const qLower = qaSearch.toLowerCase();
    const matchesSearch =
      !qaSearch ||
      r.question.toLowerCase().includes(qLower) ||
      r.answer.toLowerCase().includes(qLower) ||
      (r.keywords || []).some((kw) => kw.toLowerCase().includes(qLower));
    return matchesCat && matchesSearch;
  });

  const categories = ['All', ...Array.from(new Set(qaRules.map((r) => r.category || 'General')))];

  return (
    <Box>
      {/* Top Header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
              StockWhisk Reg DB & AI Knowledge
            </Typography>
            <Chip
              size="small"
              icon={<StorageIcon sx={{ fontSize: '14px !important' }} />}
              label="PostgreSQL Live Sync"
              color="success"
              variant="outlined"
              sx={{ fontWeight: 700, fontSize: 11 }}
            />
          </Stack>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            কী প্রশ্ন করলে কী উত্তর দেবে (AI Q&A Rules) সেট করুন, এবং লাইভ ডাটাবেজের রেজিস্টার্ড শপ ও পেন্ডিং ওটিপি কাস্টমাইজ করুন।
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={refreshing}
            sx={{ fontWeight: 700, borderRadius: 2, color: '#475569', borderColor: '#cbd5e1' }}
          >
            {refreshing ? 'Syncing...' : 'Refresh DB'}
          </Button>

          {activeTab === 0 ? (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenAddQa}
              sx={{
                fontWeight: 700,
                borderRadius: 2,
                bgcolor: '#128C7E',
                '&:hover': { bgcolor: '#0b665b' },
              }}
            >
              + নতুন প্রশ্নোত্তর (Add Q&A)
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setManualModalOpen(true)}
              sx={{
                fontWeight: 700,
                borderRadius: 2,
                bgcolor: '#128C7E',
                '&:hover': { bgcolor: '#0b665b' },
              }}
            >
              + Add Manual Customer
            </Button>
          )}
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Main Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
        <Tabs
          value={activeTab}
          onChange={(_, newVal) => setActiveTab(newVal)}
          sx={{
            borderBottom: '1px solid #e2e8f0',
            px: 2,
            '& .MuiTab-root': {
              fontWeight: 700,
              textTransform: 'none',
              fontSize: 14,
              py: 2,
            },
          }}
        >
          <Tab
            icon={<SmartToyIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label={`কী প্রশ্ন করলে কী উত্তর দেবে (${qaRules.length} টি রুলস)`}
          />
          <Tab
            icon={<StorefrontIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label={`Registered Shops (${totalShops})`}
          />
          <Tab
            icon={<PendingIcon sx={{ fontSize: 20 }} />}
            iconPosition="start"
            label={`Pending Registrations (${pendingList.length})`}
          />
        </Tabs>

        {/* ========================================================================= */}
        {/* TAB 0: AI Q&A RULES (কী প্রশ্ন করলে কী উত্তর দেবে) */}
        {/* ========================================================================= */}
        {activeTab === 0 && (
          <Box sx={{ p: 3 }}>
            {/* Banner Guide */}
            <Box
              sx={{
                p: 2.5,
                mb: 3,
                borderRadius: 2.5,
                bgcolor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <QuestionAnswerIcon sx={{ color: '#16a34a', fontSize: 32, flexShrink: 0 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#14532d' }}>
                  AI প্রশ্নোত্তর ও নলেজ রুলস (কী প্রশ্ন করলে কী উত্তর দেবে)
                </Typography>
                <Typography variant="caption" sx={{ color: '#166534', display: 'block', mt: 0.3 }}>
                  এখানে আপনি ঠিক করে দিতে পারবেন হোয়াটসঅ্যাপে গ্রাহক কোন বিষয়ে প্রশ্ন বা কি-ওয়ার্ড লিখলে AI বট কী উত্তর দেবে।
                  যেকোনো উত্তর পরিবর্তন (Edit) করতে পারেন বা নতুন প্রশ্ন ও উত্তর যুক্ত করতে পারেন। AI চ্যাট করার সময় স্বয়ংক্রিয়ভাবে এই উত্তরগুলো অনুসরণ করবে।
                </Typography>
              </Box>
            </Box>

            {/* Filter and Search Bar for Q&A */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }} alignItems="center">
              <TextField
                placeholder="প্রশ্ন, কি-ওয়ার্ড বা উত্তরের টেক্সট দিয়ে সার্চ করুন..."
                size="small"
                value={qaSearch}
                onChange={(e) => setQaSearch(e.target.value)}
                sx={{ flexGrow: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#94a3b8' }} />
                    </InputAdornment>
                  ),
                }}
              />

              <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', py: 0.5, maxWidth: '100%' }}>
                {categories.map((cat) => (
                  <Chip
                    key={cat}
                    label={cat}
                    clickable
                    color={qaCategoryFilter === cat ? 'primary' : 'default'}
                    variant={qaCategoryFilter === cat ? 'filled' : 'outlined'}
                    onClick={() => setQaCategoryFilter(cat)}
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                ))}
              </Stack>
            </Stack>

            {/* Q&A Cards List */}
            {loading ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <CircularProgress size={32} sx={{ color: '#128C7E' }} />
                <Typography variant="body2" sx={{ color: '#64748b', mt: 1.5 }}>
                  Loading Q&A Rules...
                </Typography>
              </Box>
            ) : filteredQaRules.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 2 }}>
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  কোনো প্রশ্নোত্তর পাওয়া যায়নি। উপরের "+ নতুন প্রশ্নোত্তর" বাটনে ক্লিক করে যোগ করুন।
                </Typography>
              </Box>
            ) : (
              <Stack spacing={2.5}>
                {filteredQaRules.map((rule, idx) => (
                  <Card
                    key={rule.id || idx}
                    variant="outlined"
                    sx={{
                      borderRadius: 2.5,
                      borderColor: rule.is_active ? '#e2e8f0' : '#cbd5e1',
                      opacity: rule.is_active ? 1 : 0.65,
                      transition: 'all 0.2s',
                      bgcolor: rule.is_active ? '#ffffff' : '#f8fafc',
                      '&:hover': {
                        borderColor: '#128C7E',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                      {/* Top Header */}
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Chip
                              size="small"
                              label={rule.category || 'General'}
                              sx={{
                                height: 20,
                                fontSize: 10,
                                fontWeight: 800,
                                bgcolor: '#e0e7ff',
                                color: '#3730a3',
                              }}
                            />
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a' }}>
                              {rule.question}
                            </Typography>
                          </Stack>

                          {/* Keywords Chips */}
                          <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, alignSelf: 'center' }}>
                              ট্রিগার কি-ওয়ার্ড:
                            </Typography>
                            {(rule.keywords || []).map((kw, kidx) => (
                              <Chip
                                key={kidx}
                                label={kw}
                                size="small"
                                sx={{
                                  height: 20,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  bgcolor: '#f1f5f9',
                                  color: '#334155',
                                  border: '1px solid #e2e8f0',
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>

                        {/* Controls */}
                        <Stack direction="row" spacing={1} alignItems="center">
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={rule.is_active}
                                onChange={() => handleToggleQaRuleActive(rule)}
                                color="success"
                              />
                            }
                            label={
                              <Typography variant="caption" sx={{ fontWeight: 700, color: rule.is_active ? '#16a34a' : '#64748b' }}>
                                {rule.is_active ? 'Active' : 'Paused'}
                              </Typography>
                            }
                            sx={{ mr: 0 }}
                          />
                          <Tooltip title="উত্তর বা কি-ওয়ার্ড এডিট করুন">
                            <IconButton size="small" onClick={() => handleOpenEditQa(rule)} sx={{ color: '#0284c7' }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="মুছে ফেলুন">
                            <IconButton size="small" onClick={() => handleDeleteQaRule(rule.id)} sx={{ color: '#ef4444' }}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Stack>

                      {/* Answer Bubble Box */}
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderLeft: '4px solid #128C7E',
                        }}
                      >
                        <Typography variant="caption" sx={{ color: '#128C7E', fontWeight: 800, display: 'block', mb: 0.5 }}>
                          🤖 AI নির্ধারিত উত্তর (AI Response):
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                          {rule.answer}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: REGISTERED SHOPS */}
        {/* ========================================================================= */}
        {activeTab === 1 && (
          <Box sx={{ p: 3 }}>
            {/* Filters */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
              <TextField
                placeholder="Search by shop name, owner, phone, category..."
                size="small"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadData()}
                sx={{ flexGrow: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: '#94a3b8' }} />
                    </InputAdornment>
                  ),
                }}
              />

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Subscription Plan</InputLabel>
                <Select value={planFilter} label="Subscription Plan" onChange={(e) => setPlanFilter(e.target.value)}>
                  <MenuItem value="All">All Plans</MenuItem>
                  <MenuItem value="Opening Offer 6 Months">Opening Offer (৳499)</MenuItem>
                  <MenuItem value="Customized">Customized (৳999)</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                  <MenuItem value="All">All Status</MenuItem>
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Inactive">Inactive</MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="contained"
                onClick={loadData}
                sx={{ fontWeight: 700, bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' } }}
              >
                Search
              </Button>
            </Stack>

            {/* Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5 }}>
              <Table sx={{ minWidth: 700 }}>
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Shop Name & Slug</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Phone & WhatsApp</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Category</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Subscription Plan</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Custom Notes & AI</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: '#334155' }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <CircularProgress size={32} sx={{ color: '#128C7E' }} />
                        <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>
                          Fetching registered shops...
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : shops.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          No registered shops match your criteria.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    shops.map((shop) => (
                      <TableRow key={shop.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#0f172a' }}>
                              {shop.name}
                            </Typography>
                            {shop.is_manual ? (
                              <Chip
                                size="small"
                                label="Manual"
                                sx={{ height: 18, fontSize: 9, fontWeight: 700, bgcolor: '#fef3c7', color: '#b45309' }}
                              />
                            ) : (
                              <Chip
                                size="small"
                                label="Postgres"
                                sx={{ height: 18, fontSize: 9, fontWeight: 700, bgcolor: '#e0f2fe', color: '#0369a1' }}
                              />
                            )}
                          </Stack>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            {shop.slug} {shop.email && `• ${shop.email}`}
                          </Typography>
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            {shop.phone || '—'}
                          </Typography>
                          {shop.custom_whatsapp_phone && shop.custom_whatsapp_phone !== shop.phone && (
                            <Typography variant="caption" sx={{ color: '#16a34a', display: 'block', fontWeight: 600 }}>
                              WA: {shop.custom_whatsapp_phone}
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            label={shop.business_type || 'General'}
                            sx={{ height: 22, fontSize: 11, fontWeight: 600, bgcolor: '#f1f5f9' }}
                          />
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            {shop.plan_name || 'Standard'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            Tier: {shop.plan_tier || 'basic'}
                          </Typography>
                        </TableCell>

                        <TableCell sx={{ maxWidth: 220 }}>
                          {shop.customized ? (
                            <Stack spacing={0.5}>
                              {shop.custom_notes && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: '#0f172a',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    fontWeight: 600,
                                  }}
                                >
                                  📝 {shop.custom_notes}
                                </Typography>
                              )}
                              {shop.ai_instructions && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    color: '#7c3aed',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 1,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    fontWeight: 600,
                                  }}
                                >
                                  🤖 {shop.ai_instructions}
                                </Typography>
                              )}
                              {shop.tags && shop.tags.length > 0 && (
                                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                                  {shop.tags.map((t, idx) => (
                                    <Chip
                                      key={idx}
                                      size="small"
                                      label={t}
                                      sx={{ height: 18, fontSize: 9, bgcolor: '#ede9fe', color: '#6d28d9', fontWeight: 700 }}
                                    />
                                  ))}
                                </Stack>
                              )}
                            </Stack>
                          ) : (
                            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                              Default (Click Edit to customize)
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            icon={shop.is_active ? <CheckCircleIcon sx={{ fontSize: '13px !important' }} /> : undefined}
                            label={shop.is_active ? 'Active' : 'Inactive'}
                            color={shop.is_active ? 'success' : 'default'}
                            sx={{ height: 22, fontSize: 11, fontWeight: 700 }}
                          />
                        </TableCell>

                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Tooltip title="Customize Shop Info, Notes & AI Rules">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                                onClick={() => handleOpenCustomDialog(shop)}
                                sx={{
                                  fontWeight: 700,
                                  fontSize: 11,
                                  borderColor: '#cbd5e1',
                                  color: '#334155',
                                  borderRadius: 1.5,
                                }}
                              >
                                Customize
                              </Button>
                            </Tooltip>

                            {shop.phone && (
                              <Tooltip title="Open WhatsApp Chat">
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => onDirectMessage?.(shop.custom_whatsapp_phone || shop.phone)}
                                  sx={{ bgcolor: '#dcfce7', '&:hover': { bgcolor: '#bbf7d0' } }}
                                >
                                  <WhatsAppIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}

                            {shop.is_manual && (
                              <Tooltip title="Delete Manual Record">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteManual(String(shop.id))}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
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
          </Box>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PENDING REGISTRATIONS */}
        {/* ========================================================================= */}
        {activeTab === 2 && (
          <Box sx={{ p: 3 }}>
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5 }}>
              <Table sx={{ minWidth: 650 }}>
                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Shop Name</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Owner Name</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Phone</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Category</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#334155' }}>Initiated At</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: '#334155' }}>
                      Follow-up
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          No pending registrations found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingList.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{p.shop_name}</TableCell>
                        <TableCell>{p.owner_name}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{p.phone}</TableCell>
                        <TableCell>{p.email || '—'}</TableCell>
                        <TableCell>
                          <Chip size="small" label={p.business_type || 'General'} sx={{ height: 20, fontSize: 10 }} />
                        </TableCell>
                        <TableCell sx={{ color: '#64748b', fontSize: 12 }}>
                          {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<WhatsAppIcon sx={{ fontSize: 14 }} />}
                            onClick={() => onDirectMessage?.(p.phone)}
                            sx={{ fontWeight: 700, borderRadius: 1.5, fontSize: 11 }}
                          >
                            Follow-up
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Paper>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT Q&A RULE */}
      {/* ========================================================================= */}
      <Dialog
        open={qaModalOpen}
        onClose={() => setQaModalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>
          {editingQaRule?.id ? '✏️ প্রশ্নোত্তর এডিট করুন (Edit Q&A Rule)' : '➕ নতুন প্রশ্নোত্তর যোগ করুন (Add Q&A Rule)'}
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 0.5 }}>
                গ্রাহকের প্রশ্ন বা বিষয় (Question / Topic) *
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="যেমন: সফটওয়্যারের দাম কত বা প্যাকেজ কী কী আছে?"
                value={editingQaRule?.question || ''}
                onChange={(e) => setEditingQaRule((prev) => ({ ...prev, question: e.target.value }))}
              />
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 0.5 }}>
                ট্রিগার কি-ওয়ার্ডস (Keywords) — কমা দিয়ে আলাদা করুন *
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="যেমন: দাম, প্রাইস, price, প্যাকেজ, package, খরচ, টাকা"
                value={
                  Array.isArray(editingQaRule?.keywords)
                    ? editingQaRule.keywords.join(', ')
                    : editingQaRule?.keywords || ''
                }
                onChange={(e) =>
                  setEditingQaRule((prev) => ({
                    ...prev,
                    keywords: e.target.value.split(',').map((k) => k.trim()),
                  }))
                }
                helperText="গ্রাহক মেসেজে এই শব্দগুলোর যেকোনো একটি লিখলেই এই প্রশ্নোত্তরটি সক্রিয় হবে।"
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 0.5 }}>
                  ক্যাটাগরি (Category)
                </Typography>
                <Select
                  fullWidth
                  size="small"
                  value={editingQaRule?.category || 'General'}
                  onChange={(e) => setEditingQaRule((prev) => ({ ...prev, category: e.target.value }))}
                >
                  <MenuItem value="Pricing">Pricing (দাম ও প্যাকেজ)</MenuItem>
                  <MenuItem value="Features">Features (ফিচার ও সুবিধা)</MenuItem>
                  <MenuItem value="Hardware & POS">Hardware & POS (ওজন স্কেল/বারকোড)</MenuItem>
                  <MenuItem value="Demo & Trial">Demo & Trial (ডেমো ও ট্রায়াল)</MenuItem>
                  <MenuItem value="General">General (সাধারণ)</MenuItem>
                </Select>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={editingQaRule?.is_active ?? true}
                      onChange={(e) => setEditingQaRule((prev) => ({ ...prev, is_active: e.target.checked }))}
                      color="success"
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      সক্রিয় রাখুন (Enable Rule)
                    </Typography>
                  }
                />
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 0.5 }}>
                এআই নির্ধারিত উত্তর (AI Response / Answer) *
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={4}
                placeholder="গ্রাহককে যে উত্তর দেওয়া হবে তা বিস্তারিত ও সুন্দর ভাষায় লিখুন..."
                value={editingQaRule?.answer || ''}
                onChange={(e) => setEditingQaRule((prev) => ({ ...prev, answer: e.target.value }))}
                helperText="AI এই উত্তরের মূল পয়েন্ট ঠিক রেখে অত্যন্ত মিষ্টি ও প্রফেশনাল ভাষায় কাস্টমারকে উত্তর দেবে।"
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setQaModalOpen(false)} sx={{ color: '#64748b', fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveQaRule}
            disabled={qaSaving || !editingQaRule?.question || !editingQaRule?.answer}
            sx={{ bgcolor: '#128C7E', '&:hover': { bgcolor: '#0b665b' }, fontWeight: 700 }}
          >
            {qaSaving ? 'Saving...' : 'Save Q&A Rule'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: CUSTOMIZE SHOP INFO */}
      {/* ========================================================================= */}
      <Dialog
        open={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>
          Customize Shop Details: {selectedShop?.name}
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>
                REGISTERED PHONE
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                {selectedShop?.phone || '—'}
              </Typography>
            </Box>

            <TextField
              label="Custom WhatsApp Phone (if different)"
              size="small"
              fullWidth
              value={customWaPhone}
              onChange={(e) => setCustomWaPhone(e.target.value)}
              helperText="If the shop owner chats from a different personal WhatsApp number."
            />

            <TextField
              label="Operator Custom Notes"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="e.g., VIP client, scale barcode configured, prefers afternoon calls..."
              helperText="Internal notes saved strictly in CRM."
            />

            <TextField
              label="Special AI Bot Instructions"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder="e.g., Offer 10% discount on renewal, emphasize offline sales mode..."
              helperText="The AI bot will strictly follow these instructions when conversing with this contact."
            />

            <TextField
              label="Tags (comma separated)"
              size="small"
              fullWidth
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="VIP, SuperShop, Priority"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setCustomModalOpen(false)} sx={{ color: '#64748b', fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveCustom}
            disabled={savingCustom}
            sx={{ bgcolor: '#128C7E', '&:hover': { bgcolor: '#0b665b' }, fontWeight: 700 }}
          >
            {savingCustom ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: ADD MANUAL REGISTRATION */}
      {/* ========================================================================= */}
      <Dialog
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>
          Add Manual Customer / Shop Record
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Shop Name *"
              size="small"
              fullWidth
              value={manualForm.shop_name}
              onChange={(e) => setManualForm({ ...manualForm, shop_name: e.target.value })}
            />

            <TextField
              label="Owner Name"
              size="small"
              fullWidth
              value={manualForm.owner_name}
              onChange={(e) => setManualForm({ ...manualForm, owner_name: e.target.value })}
            />

            <TextField
              label="Phone Number *"
              size="small"
              fullWidth
              value={manualForm.phone}
              onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
              placeholder="017xxxxxxxx"
            />

            <TextField
              label="Category / Business Type"
              size="small"
              fullWidth
              value={manualForm.business_type}
              onChange={(e) => setManualForm({ ...manualForm, business_type: e.target.value })}
              placeholder="grocery, electronics, clothing"
            />

            <FormControl size="small" fullWidth>
              <InputLabel>Subscription Plan</InputLabel>
              <Select
                value={manualForm.plan_name}
                label="Subscription Plan"
                onChange={(e) => setManualForm({ ...manualForm, plan_name: e.target.value })}
              >
                <MenuItem value="Opening Offer 6 Months">Opening Offer (৳499)</MenuItem>
                <MenuItem value="Customized">Customized / Enterprise (৳999)</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Custom Notes"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={manualForm.custom_notes}
              onChange={(e) => setManualForm({ ...manualForm, custom_notes: e.target.value })}
              placeholder="e.g. Registered via direct bank payment"
            />

            <TextField
              label="AI Bot Instructions"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={manualForm.ai_instructions}
              onChange={(e) => setManualForm({ ...manualForm, ai_instructions: e.target.value })}
              placeholder="e.g. Treat as active enterprise shop"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setManualModalOpen(false)} sx={{ color: '#64748b', fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveManual}
            disabled={savingManual}
            sx={{ bgcolor: '#128C7E', '&:hover': { bgcolor: '#0b665b' }, fontWeight: 700 }}
          >
            {savingManual ? 'Saving...' : 'Create Customer Record'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
