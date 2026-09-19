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
  Tabs,
  Tab,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  IconButton,
  Switch,
  FormControlLabel,
  Badge,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StoreIcon from '@mui/icons-material/Store';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import PsychologyIcon from '@mui/icons-material/Psychology';
import ThumbsUpDownIcon from '@mui/icons-material/ThumbsUpDown';

import {
  RegDbService,
  RegShop,
  RegPending,
  QARule,
  LearnedSuggestion,
} from '@/lib/api';

interface RegDatabaseProps {
  onDirectMessage?: (phone: string) => void;
}

export default function RegDatabase({ onDirectMessage }: RegDatabaseProps) {
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mining, setMining] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{
    severity: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Data
  const [shops, setShops] = useState<RegShop[]>([]);
  const [pending, setPending] = useState<RegPending[]>([]);
  const [qaRules, setQaRules] = useState<QARule[]>([]);
  const [suggestions, setSuggestions] = useState<LearnedSuggestion[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [editShop, setEditShop] = useState<RegShop | null>(null);
  const [customNotes, setCustomNotes] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [customWaPhone, setCustomWaPhone] = useState('');
  const [tags, setTags] = useState('');

  const [editQaRule, setEditQaRule] = useState<Partial<QARule> | null>(null);
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaKeywords, setQaKeywords] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [qaCategory, setQaCategory] = useState('General');
  const [qaActive, setQaActive] = useState(true);

  const [openManualModal, setOpenManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    shop_name: '',
    owner_name: '',
    phone: '',
    business_type: 'Retail / General',
    plan_name: 'Opening Offer 6 Months',
    is_active: true,
    custom_notes: '',
    ai_instructions: '',
    tags: '',
  });

  const loadData = async () => {
    try {
      setRefreshing(true);
      const [shopsRes, pendingRes, qaRes, sugRes] = await Promise.all([
        RegDbService.getShops().catch(() => ({
          data: { shops: [], total_shops: 0, active_shops: 0 },
        })),
        RegDbService.getPending().catch(() => ({ data: [] })),
        RegDbService.getQARules().catch(() => ({ data: [] })),
        RegDbService.getLearnedSuggestions().catch(() => ({ data: [] })),
      ]);

      setShops(shopsRes.data?.shops || []);
      setPending(pendingRes.data || []);
      setQaRules(qaRes.data || []);
      setSuggestions(sugRes.data || []);
    } catch (err: any) {
      console.error('Error loading Reg DB data:', err);
      setAlertInfo({
        severity: 'error',
        message: 'ডাটা লোড করতে সমস্যা হয়েছে: ' + (err?.message || err),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Mine chats
  const handleMineChats = async () => {
    try {
      setMining(true);
      setAlertInfo({
        severity: 'info',
        message: 'পূর্ববর্তী চ্যাট হিস্ট্রি বিশ্লেষণ করা হচ্ছে...',
      });
      const res = await RegDbService.mineChats();
      await loadData();
      setAlertInfo({
        severity: 'success',
        message: `চ্যাট অ্যানালাইসিস সম্পন্ন! ${res.data.mined_count} টি নতুন প্রশ্নোত্তর সাজেশন প্রস্তুত হয়েছে।`,
      });
    } catch (err: any) {
      setAlertInfo({
        severity: 'error',
        message: 'চ্যাট অ্যানালাইসিসে ত্রুটি: ' + (err?.message || err),
      });
    } finally {
      setMining(false);
    }
  };

  // Approve suggestion
  const handleApproveSuggestion = async (sugId: string) => {
    try {
      await RegDbService.approveSuggestion(sugId);
      setAlertInfo({
        severity: 'success',
        message: 'সাজেশনটি সফলভাবে অনুমোদন করে AI রুলসে যুক্ত করা হয়েছে!',
      });
      await loadData();
    } catch (err: any) {
      setAlertInfo({
        severity: 'error',
        message: 'অনুমোদনে ত্রুটি: ' + (err?.message || err),
      });
    }
  };

  // Dismiss suggestion
  const handleDismissSuggestion = async (sugId: string) => {
    try {
      await RegDbService.dismissSuggestion(sugId);
      setAlertInfo({
        severity: 'info',
        message: 'সাজেশনটি বাতিল করা হয়েছে।',
      });
      await loadData();
    } catch (err: any) {
      setAlertInfo({
        severity: 'error',
        message: 'বাতিল করতে সমস্যা: ' + (err?.message || err),
      });
    }
  };

  // Save QA Rule
  const handleSaveQaRule = async () => {
    if (!qaQuestion.trim() || !qaAnswer.trim()) {
      setAlertInfo({
        severity: 'error',
        message: 'প্রশ্ন এবং উত্তর উভয়ই দেওয়া আবশ্যক!',
      });
      return;
    }
    try {
      const kwList = qaKeywords
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k);
      await RegDbService.saveQARule({
        id: editQaRule?.id,
        question: qaQuestion.trim(),
        keywords: kwList,
        answer: qaAnswer.trim(),
        category: qaCategory,
        is_active: qaActive,
      });
      setAlertInfo({
        severity: 'success',
        message: 'AI প্রশ্নোত্তর রুল সফলভাবে সংরক্ষিত হয়েছে!',
      });
      setEditQaRule(null);
      await loadData();
    } catch (err: any) {
      setAlertInfo({
        severity: 'error',
        message: 'সংরক্ষণ করতে ব্যর্থ: ' + (err?.message || err),
      });
    }
  };

  // Toggle QA active
  const handleToggleQaActive = async (rule: QARule) => {
    try {
      await RegDbService.saveQARule({
        ...rule,
        is_active: !rule.is_active,
      });
      setQaRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, is_active: !r.is_active } : r
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Delete QA Rule
  const handleDeleteQaRule = async (ruleId: string) => {
    if (!confirm('আপনি কি নিশ্চিত যে এই প্রশ্ন-উত্তরটি মুছে ফেলতে চান?')) return;
    try {
      await RegDbService.deleteQARule(ruleId);
      setAlertInfo({
        severity: 'success',
        message: 'প্রশ্নোত্তর সফলভাবে মুছে ফেলা হয়েছে!',
      });
      await loadData();
    } catch (err: any) {
      setAlertInfo({
        severity: 'error',
        message: 'মুছে ফেলতে ব্যর্থ: ' + (err?.message || err),
      });
    }
  };

  // Save Shop Customization
  const handleSaveShopCustom = async () => {
    if (!editShop) return;
    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);
      await RegDbService.saveShopCustom(editShop.id, {
        custom_notes: customNotes,
        ai_instructions: aiInstructions,
        custom_whatsapp_phone: customWaPhone,
        tags: tagList,
      });
      setAlertInfo({
        severity: 'success',
        message: `শপ ${editShop.name}-এর জন্য কাস্টমাইজেশন সংরক্ষিত হয়েছে!`,
      });
      setEditShop(null);
      await loadData();
    } catch (err: any) {
      setAlertInfo({
        severity: 'error',
        message: 'কাস্টমাইজেশন সংরক্ষণ ব্যর্থ: ' + (err?.message || err),
      });
    }
  };

  // Save Manual Shop
  const handleSaveManualShop = async () => {
    if (!manualForm.shop_name.trim() || !manualForm.phone.trim()) {
      setAlertInfo({
        severity: 'error',
        message: 'দোকানের নাম এবং ফোন নম্বর দেওয়া আবশ্যক!',
      });
      return;
    }
    try {
      const tagList = manualForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);
      await RegDbService.saveManualShop({
        ...manualForm,
        tags: tagList,
      });
      setAlertInfo({
        severity: 'success',
        message: 'ম্যানুয়াল শপ সফলভাবে যুক্ত হয়েছে!',
      });
      setOpenManualModal(false);
      setManualForm({
        shop_name: '',
        owner_name: '',
        phone: '',
        business_type: 'Retail / General',
        plan_name: 'Opening Offer 6 Months',
        is_active: true,
        custom_notes: '',
        ai_instructions: '',
        tags: '',
      });
      await loadData();
    } catch (err: any) {
      setAlertInfo({
        severity: 'error',
        message: 'যুক্ত করতে ব্যর্থ: ' + (err?.message || err),
      });
    }
  };

  // Filtered QA Rules
  const filteredQaRules = qaRules.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      r.question.toLowerCase().includes(q) ||
      r.answer.toLowerCase().includes(q) ||
      (r.keywords && r.keywords.some((k) => k.toLowerCase().includes(q)));
    const matchCat =
      categoryFilter === 'ALL' || r.category === categoryFilter;
    return matchSearch && matchCat;
  });

  // Filtered Shops
  const filteredShops = shops.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.business_type && s.business_type.toLowerCase().includes(q));
    const matchPlan = planFilter === 'ALL' || s.plan_name.includes(planFilter);
    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && s.is_active) ||
      (statusFilter === 'INACTIVE' && !s.is_active);
    return matchSearch && matchPlan && matchStatus;
  });

  const categories = [
    'ALL',
    'Pricing',
    'Features',
    'Hardware & POS',
    'Demo & Trial',
    'General',
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Alert Banner */}
      {alertInfo && (
        <Alert
          severity={alertInfo.severity}
          sx={{ mb: 3 }}
          onClose={() => setAlertInfo(null)}
        >
          {alertInfo.message}
        </Alert>
      )}

      {/* Header & Stats */}
      <Card
        sx={{
          mb: 3,
          boxShadow: 2,
          border: '1px solid #e2e8f0',
          borderRadius: 2,
        }}
      >
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            spacing={2}
          >
            <Box>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Typography
                  variant="h5"
                  sx={{ fontWeight: 700, color: '#0f172a' }}
                >
                  StockWhisk Registration & AI Knowledge Engine
                </Typography>
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                  label="Live DB Sync"
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              </Stack>
              <Typography variant="body2" sx={{ color: '#475569', mt: 0.5 }}>
                StockWhisk কোর ডাটাবেজ পর্যবেক্ষণ, গ্রাহকের প্রশ্নোত্তরের বিধিমালা এবং পূর্ববর্তী/ভবিষ্যতের চ্যাট থেকে স্বয়ংক্রিয় লার্নিং নিয়ন্ত্রণ।
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={
                  refreshing ? (
                    <CircularProgress size={16} />
                  ) : (
                    <RefreshIcon />
                  )
                }
                onClick={loadData}
                disabled={refreshing}
                sx={{
                  borderColor: '#cbd5e1',
                  color: '#334155',
                  textTransform: 'none',
                  fontWeight: 600,
                }}
              >
                Refresh Data
              </Button>
              {tabIndex === 0 && (
                <Button
                  variant="contained"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={() => {
                    setEditQaRule({});
                    setQaQuestion('');
                    setQaKeywords('');
                    setQaAnswer('');
                    setQaCategory('General');
                    setQaActive(true);
                  }}
                  sx={{
                    bgcolor: '#2563eb',
                    '&:hover': { bgcolor: '#1d4ed8' },
                    textTransform: 'none',
                    fontWeight: 600,
                  }}
                >
                  নতুন প্রশ্নোত্তর যোগ করুন
                </Button>
              )}
              {tabIndex === 1 && (
                <Button
                  variant="contained"
                  startIcon={
                    mining ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <PsychologyIcon />
                    )
                  }
                  onClick={handleMineChats}
                  disabled={mining}
                  sx={{
                    bgcolor: '#7c3aed',
                    '&:hover': { bgcolor: '#6d28d9' },
                    textTransform: 'none',
                    fontWeight: 600,
                  }}
                >
                  Scan & Mine Previous Chats
                </Button>
              )}
              {tabIndex === 2 && (
                <Button
                  variant="contained"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={() => setOpenManualModal(true)}
                  sx={{
                    bgcolor: '#059669',
                    '&:hover': { bgcolor: '#047857' },
                    textTransform: 'none',
                    fontWeight: 600,
                  }}
                >
                  + Add Manual Customer / Shop
                </Button>
              )}
            </Stack>
          </Stack>

          {/* Quick Metrics */}
          <Stack
            direction="row"
            spacing={{ xs: 1.5, md: 3 }}
            sx={{ mt: 2.5, pt: 2, borderTop: '1px solid #f1f5f9' }}
            flexWrap="wrap"
          >
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                সক্রিয় AI রুলস
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#2563eb' }}>
                {qaRules.filter((r) => r.is_active).length} / {qaRules.length}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                লার্নিং সাজেশনস
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#7c3aed' }}>
                {suggestions.length}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                মোট রেজিস্টার্ড শপ
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
                {shops.length}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                পেন্ডিং ওটিপি রেজিস্ট্রেশন
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#d97706' }}>
                {pending.length}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Main Tabs Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tabIndex}
          onChange={(_, val) => {
            setTabIndex(val);
            setSearchQuery('');
          }}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab
            icon={<SmartToyIcon />}
            iconPosition="start"
            label={`AI প্রশ্নোত্তর ও রুলস (${qaRules.length})`}
            sx={{ fontWeight: 600, textTransform: 'none', fontSize: '0.95rem' }}
          />
          <Tab
            icon={
              <Badge badgeContent={suggestions.length} color="secondary">
                <PsychologyIcon />
              </Badge>
            }
            iconPosition="start"
            label="স্বয়ংক্রিয় লার্নিং সাজেশনস"
            sx={{ fontWeight: 600, textTransform: 'none', fontSize: '0.95rem' }}
          />
          <Tab
            icon={<StoreIcon />}
            iconPosition="start"
            label={`Registered Shops (${shops.length})`}
            sx={{ fontWeight: 600, textTransform: 'none', fontSize: '0.95rem' }}
          />
          <Tab
            icon={<PendingActionsIcon />}
            iconPosition="start"
            label={`Pending Registrations (${pending.length})`}
            sx={{ fontWeight: 600, textTransform: 'none', fontSize: '0.95rem' }}
          />
        </Tabs>
      </Box>

      {/* ========================================================= */}
      {/* TAB 0: AI Q&A RULES (কী প্রশ্ন করলে কী উত্তর দেবে)       */}
      {/* ========================================================= */}
      {tabIndex === 0 && (
        <Box>
          {/* Informational Guidance Banner */}
          <Alert
            icon={<AutoAwesomeIcon sx={{ color: '#2563eb' }} />}
            severity="info"
            sx={{
              mb: 3,
              backgroundColor: '#eff6ff',
              color: '#1e3a8a',
              border: '1px solid #bfdbfe',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              কী প্রশ্ন করলে AI কী উত্তর দেবে — নলেজবেস ও উত্তর নির্দেশিকা
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              গ্রাহক হোয়াটসঅ্যাপে কোনো বিষয় বা প্রশ্ন জিজ্ঞেস করলে AI বট সরাসরি এখান থেকে সঠিক তথ্য ও উত্তর তৈরি করবে। যেকোনো উত্তর পরিবর্তন করতে পারেন, কি-ওয়ার্ড বদলাতে পারেন বা নতুন প্রশ্নোত্তর যুক্ত করতে পারেন।
            </Typography>
          </Alert>

          {/* Search & Category Filter */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems="center"
            sx={{ mb: 3 }}
          >
            <TextField
              placeholder="প্রশ্ন, কি-ওয়ার্ড বা উত্তর দিয়ে খুঁজুন..."
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ width: { xs: '100%', sm: 380 }, bgcolor: '#fff' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8' }} />
                  </InputAdornment>
                ),
              }}
            />

            <Stack direction="row" spacing={1} flexWrap="wrap">
              {categories.map((cat) => (
                <Chip
                  key={cat}
                  label={cat === 'ALL' ? 'সকল ক্যাটাগরি' : cat}
                  onClick={() => setCategoryFilter(cat)}
                  color={categoryFilter === cat ? 'primary' : 'default'}
                  variant={categoryFilter === cat ? 'filled' : 'outlined'}
                  sx={{
                    fontWeight: 600,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: categoryFilter === cat ? undefined : '#f1f5f9' },
                  }}
                />
              ))}
            </Stack>
          </Stack>

          {/* Q&A Cards Grid */}
          <Stack spacing={2.5}>
            {filteredQaRules.map((rule) => (
              <Card
                key={rule.id}
                sx={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  opacity: rule.is_active ? 1 : 0.65,
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
                }}
              >
                <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    spacing={1.5}
                    sx={{ mb: 1.5 }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
                      <Chip
                        label={rule.category || 'General'}
                        size="small"
                        sx={{
                          bgcolor: '#f1f5f9',
                          color: '#334155',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                        }}
                      />
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem' }}
                      >
                        {rule.question}
                      </Typography>
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1}>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={rule.is_active}
                            onChange={() => handleToggleQaActive(rule)}
                            color="success"
                          />
                        }
                        label={
                          <Typography variant="caption" sx={{ fontWeight: 600, color: rule.is_active ? '#059669' : '#64748b' }}>
                            {rule.is_active ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Off)'}
                          </Typography>
                        }
                        sx={{ mr: 1 }}
                      />
                      <Tooltip title="এডিট করুন">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditQaRule(rule);
                            setQaQuestion(rule.question);
                            setQaKeywords((rule.keywords || []).join(', '));
                            setQaAnswer(rule.answer);
                            setQaCategory(rule.category || 'General');
                            setQaActive(rule.is_active);
                          }}
                          sx={{ color: '#2563eb' }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="ডিলিট করুন">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteQaRule(rule.id)}
                          sx={{ color: '#ef4444' }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>

                  {/* Trigger Keywords */}
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block', mb: 0.5 }}>
                      গ্রাহক যেসব শব্দ লিখলে এটি ট্রিগার হবে (Trigger Keywords):
                    </Typography>
                    <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                      {(rule.keywords || []).map((kw, i) => (
                        <Chip
                          key={i}
                          label={kw}
                          size="small"
                          variant="outlined"
                          sx={{
                            borderColor: '#cbd5e1',
                            bgcolor: '#f8fafc',
                            color: '#1e293b',
                            fontSize: '0.75rem',
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>

                  {/* Answer Preview Box */}
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: '#f8fafc',
                      borderLeft: '4px solid #2563eb',
                      borderRadius: '0 8px 8px 0',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: '#2563eb', fontWeight: 700, display: 'block', mb: 0.5 }}>
                      🤖 AI যে উত্তর দেবে (AI Response):
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#1e293b',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.6,
                        fontFamily: 'inherit',
                      }}
                    >
                      {rule.answer}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}

            {filteredQaRules.length === 0 && (
              <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#fff', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography variant="body1" sx={{ color: '#64748b' }}>
                  কোনো প্রশ্নোত্তর পাওয়া যায়নি।
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>
      )}

      {/* ========================================================= */}
      {/* TAB 1: CONTINUOUS LEARNING SUGGESTIONS (স্বয়ংক্রিয় লার্নিং) */}
      {/* ========================================================= */}
      {tabIndex === 1 && (
        <Box>
          <Alert
            icon={<PsychologyIcon sx={{ color: '#7c3aed' }} />}
            severity="info"
            sx={{
              mb: 3,
              backgroundColor: '#f5f3ff',
              color: '#5b21b6',
              border: '1px solid #ddd6fe',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              AI স্বয়ংক্রিয় লার্নিং ও সাজেশনস (Continuous Learning Engine)
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              পূর্ববর্তী চ্যাট হিস্ট্রি এবং লাইভচ্যাটে আপনার নিজের পাঠানো উত্তরগুলো বিশ্লেষণ করে AI নিজে থেকে নতুন প্রশ্নোত্তর তৈরি করে এখানে জমা রাখে। আপনি পছন্দ অনুযায়ী এক ক্লিকে অ্যাপ্রুভ করে এটিকে স্থায়ী বিধিমালার অংশ বানিয়ে নিতে পারেন।
            </Typography>
          </Alert>

          {suggestions.length === 0 ? (
            <Card sx={{ p: 5, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 2 }}>
              <PsychologyIcon sx={{ fontSize: 48, color: '#c4b5fd', mb: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
                বর্তমানে কোনো পেন্ডিং সাজেশন নেই
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5, mb: 2 }}>
                পূর্ববর্তী সমস্ত মেসেজ অ্যানালাইসিস করে নতুন প্রশ্ন বের করতে নিচের বাটনে ক্লিক করুন:
              </Typography>
              <Button
                variant="contained"
                startIcon={mining ? <CircularProgress size={16} color="inherit" /> : <PsychologyIcon />}
                onClick={handleMineChats}
                disabled={mining}
                sx={{
                  bgcolor: '#7c3aed',
                  '&:hover': { bgcolor: '#6d28d9' },
                  textTransform: 'none',
                  fontWeight: 600,
                }}
              >
                Scan & Mine Previous Chats Now
              </Button>
            </Card>
          ) : (
            <Stack spacing={2.5}>
              {suggestions.map((sug) => (
                <Card
                  key={sug.id}
                  sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                      spacing={1.5}
                      sx={{ mb: 1.5 }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
                        <Chip
                          label={sug.source === 'live_human_reply' ? 'লাইভচ্যাট পর্যবেক্ষণ' : 'পূর্বের চ্যাট হিস্ট্রি'}
                          size="small"
                          color={sug.source === 'live_human_reply' ? 'success' : 'secondary'}
                          sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                        />
                        <Chip
                          label={sug.category || 'General'}
                          size="small"
                          sx={{ bgcolor: '#f1f5f9', fontWeight: 600, fontSize: '0.75rem' }}
                        />
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem' }}>
                          {sug.question}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<CheckCircleIcon />}
                          onClick={() => handleApproveSuggestion(sug.id)}
                          sx={{
                            bgcolor: '#059669',
                            '&:hover': { bgcolor: '#047857' },
                            textTransform: 'none',
                            fontWeight: 600,
                          }}
                        >
                          Approve to Rules
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          onClick={() => handleDismissSuggestion(sug.id)}
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                          Dismiss
                        </Button>
                      </Stack>
                    </Stack>

                    {/* Original query quote */}
                    {sug.customer_query_sample && (
                      <Box sx={{ mb: 1.5, p: 1, bgcolor: '#f1f5f9', borderRadius: 1 }}>
                        <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
                          গ্রাহকের মূল প্রশ্ন/মেসেজ: &ldquo;{sug.customer_query_sample}&rdquo;
                        </Typography>
                      </Box>
                    )}

                    {/* Keywords */}
                    <Box sx={{ mb: 1.5 }}>
                      <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block', mb: 0.5 }}>
                        প্রস্তাবিত কি-ওয়ার্ডসমূহ:
                      </Typography>
                      <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                        {(sug.keywords || []).map((kw, i) => (
                          <Chip
                            key={i}
                            label={kw}
                            size="small"
                            variant="outlined"
                            sx={{ borderColor: '#cbd5e1', bgcolor: '#f8fafc', fontSize: '0.75rem' }}
                          />
                        ))}
                      </Stack>
                    </Box>

                    {/* Answer Preview */}
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: '#faf5ff',
                        borderLeft: '4px solid #7c3aed',
                        borderRadius: '0 8px 8px 0',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: '#7c3aed', fontWeight: 700, display: 'block', mb: 0.5 }}>
                        🧠 AI যে উত্তর প্রস্তুত করেছে (Suggested Answer):
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {sug.answer}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* ========================================================= */}
      {/* TAB 2: REGISTERED SHOPS (রেজিস্টার্ড শপ)                  */}
      {/* ========================================================= */}
      {tabIndex === 2 && (
        <Box>
          {/* Filters */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ mb: 3 }}
            alignItems="center"
            justifyContent="space-between"
          >
            <TextField
              placeholder="দোকানের নাম, ফোন নম্বর, ক্যাটাগরি দিয়ে খুঁজুন..."
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ width: { xs: '100%', sm: 380 }, bgcolor: '#fff' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#94a3b8' }} />
                  </InputAdornment>
                ),
              }}
            />

            <Stack direction="row" spacing={1.5}>
              <TextField
                select
                size="small"
                label="প্যাকেজ ফিল্টার"
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                SelectProps={{ native: true }}
                sx={{ width: 180, bgcolor: '#fff' }}
              >
                <option value="ALL">সকল প্যাকেজ</option>
                <option value="Opening Offer">Opening Offer 6M</option>
                <option value="customized">Enterprise / Custom</option>
              </TextField>

              <TextField
                select
                size="small"
                label="স্ট্যাটাস"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                SelectProps={{ native: true }}
                sx={{ width: 140, bgcolor: '#fff' }}
              >
                <option value="ALL">সকল</option>
                <option value="ACTIVE">সক্রিয় (Active)</option>
                <option value="INACTIVE">নিষ্ক্রিয়</option>
              </TextField>
            </Stack>
          </Stack>

          {/* Table */}
          <TableContainer component={Paper} sx={{ boxShadow: 1, border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <Table size="medium">
              <TableHead sx={{ bgcolor: '#f8fafc' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>দোকানের নাম ও আইডি</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>মালিক ও ফোন নম্বর</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>ক্যাটাগরি</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>প্যাকেজ</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>স্ট্যাটাস</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>কাস্টম নোট / AI নির্দেশ</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#334155' }}>অ্যাকশন</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredShops.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        {s.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        ID: {s.id} • slug: {s.slug || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                        {s.phone || '—'}
                      </Typography>
                      {s.custom_whatsapp_phone && (
                        <Typography variant="caption" sx={{ color: '#2563eb', display: 'block' }}>
                          WA: {s.custom_whatsapp_phone}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={s.business_type || 'General'} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                        {s.plan_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={s.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={s.is_active ? 'success' : 'default'}
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      {s.custom_notes || s.ai_instructions ? (
                        <Tooltip title={`নোট: ${s.custom_notes || 'নেই'}\nAI নির্দেশ: ${s.ai_instructions || 'নেই'}`}>
                          <Chip
                            label="Customized"
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ fontWeight: 600, cursor: 'pointer' }}
                          />
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>—</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Tooltip title="কাস্টমাইজ ও নোট এডিট">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setEditShop(s);
                              setCustomNotes(s.custom_notes || '');
                              setAiInstructions(s.ai_instructions || '');
                              setCustomWaPhone(s.custom_whatsapp_phone || '');
                              setTags((s.tags || []).join(', '));
                            }}
                            sx={{ color: '#2563eb' }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {onDirectMessage && s.phone && (
                          <Tooltip title="হোয়াটসঅ্যাপ চ্যাট শুরু করুন">
                            <IconButton
                              size="small"
                              onClick={() => onDirectMessage(s.custom_whatsapp_phone || s.phone)}
                              sx={{ color: '#059669' }}
                            >
                              <WhatsAppIcon fontSize="small" />
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
        </Box>
      )}

      {/* ========================================================= */}
      {/* TAB 3: PENDING REGISTRATIONS (পেন্ডিং ওটিপি)              */}
      {/* ========================================================= */}
      {tabIndex === 3 && (
        <Box>
          <TableContainer component={Paper} sx={{ boxShadow: 1, border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <Table size="medium">
              <TableHead sx={{ bgcolor: '#f8fafc' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>দোকানের নাম</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>মালিকের নাম</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>ফোন নম্বর</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>ইমেইল</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#334155' }}>তারিখ</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: '#334155' }}>অ্যাকশন</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pending.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{p.shop_name}</TableCell>
                    <TableCell>{p.owner_name || '—'}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#2563eb' }}>{p.phone || '—'}</TableCell>
                    <TableCell>{p.email || '—'}</TableCell>
                    <TableCell sx={{ color: '#64748b' }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {onDirectMessage && p.phone && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          startIcon={<WhatsAppIcon />}
                          onClick={() => onDirectMessage(p.phone)}
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        >
                          WhatsApp Follow-up
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* ========================================================= */}
      {/* MODAL: EDIT / ADD QA RULE                                 */}
      {/* ========================================================= */}
      <Dialog
        open={Boolean(editQaRule)}
        onClose={() => setEditQaRule(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#0f172a' }}>
          {editQaRule?.id ? 'AI প্রশ্নোত্তর রুল এডিট করুন' : 'নতুন AI প্রশ্নোত্তর যোগ করুন'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <TextField
              label="প্রশ্ন বা বিষয় (Question / Topic)"
              fullWidth
              value={qaQuestion}
              onChange={(e) => setQaQuestion(e.target.value)}
              placeholder="যেমন: সফটওয়্যারের দাম কত বা প্যাকেজ কী কী আছে?"
            />
            <TextField
              label="ট্রিগার কি-ওয়ার্ডস (Keywords - কমা দিয়ে আলাদা করুন)"
              fullWidth
              value={qaKeywords}
              onChange={(e) => setQaKeywords(e.target.value)}
              placeholder="দাম, প্রাইস, প্যাকেজ, খরচ, কত টাকা, price, cost"
              helperText="গ্রাহক মেসেজে এই শব্দগুলোর যেকোনো একটি লিখলে AI এই উত্তরকে প্রাধান্য দেবে।"
            />
            <Stack direction="row" spacing={2}>
              <TextField
                select
                label="ক্যাটাগরি"
                value={qaCategory}
                onChange={(e) => setQaCategory(e.target.value)}
                SelectProps={{ native: true }}
                sx={{ width: 220 }}
              >
                <option value="General">General</option>
                <option value="Pricing">Pricing</option>
                <option value="Features">Features</option>
                <option value="Hardware & POS">Hardware & POS</option>
                <option value="Demo & Trial">Demo & Trial</option>
              </TextField>
              <FormControlLabel
                control={
                  <Switch
                    checked={qaActive}
                    onChange={(e) => setQaActive(e.target.checked)}
                    color="success"
                  />
                }
                label="এই রুলটি সক্রিয় রাখুন (Active)"
              />
            </Stack>
            <TextField
              label="AI যে উত্তর দেবে (AI Answer / Script)"
              multiline
              rows={6}
              fullWidth
              value={qaAnswer}
              onChange={(e) => setQaAnswer(e.target.value)}
              placeholder="গ্রাহকের এই প্রশ্নের উত্তরে AI কী কথা বলবে তা বিস্তারিত এখানে লিখে দিন..."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditQaRule(null)} sx={{ color: '#64748b' }}>
            বাতিল
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveQaRule}
            sx={{ bgcolor: '#2563eb', fontWeight: 600 }}
          >
            সেভ করুন (Save Rule)
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL: CUSTOMIZE REGISTERED SHOP                          */}
      {/* ========================================================= */}
      <Dialog
        open={Boolean(editShop)}
        onClose={() => setEditShop(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#0f172a' }}>
          শপ কাস্টমাইজেশন: {editShop?.name}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <TextField
              label="Custom WhatsApp Phone (যদি ভিন্ন নম্বর হয়)"
              fullWidth
              value={customWaPhone}
              onChange={(e) => setCustomWaPhone(e.target.value)}
              placeholder="017xxxxxxxx"
            />
            <TextField
              label="অপারেটর নোট (Custom Notes)"
              multiline
              rows={3}
              fullWidth
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="যেমন: ভিআইপি ক্লায়েন্ট, ডিজিটাল ওজন স্কেল বারকোড সেটআপ কমপ্লিট।"
            />
            <TextField
              label="বিশেষ AI বট নির্দেশনা (AI Instructions)"
              multiline
              rows={3}
              fullWidth
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              placeholder="যেমন: এই গ্রাহককে বাৎসরিক রিনিউয়ালে ১০% ডিসকাউন্টের অফার দেবেন।"
            />
            <TextField
              label="ট্যাগ (Tags - কমা দিয়ে আলাদা করুন)"
              fullWidth
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="VIP, SuperShop, Renewal"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditShop(null)} sx={{ color: '#64748b' }}>
            বাতিল
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveShopCustom}
            sx={{ bgcolor: '#2563eb', fontWeight: 600 }}
          >
            সংরক্ষণ করুন
          </Button>
        </DialogActions>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL: ADD MANUAL SHOP                                    */}
      {/* ========================================================= */}
      <Dialog
        open={openManualModal}
        onClose={() => setOpenManualModal(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#0f172a' }}>
          ম্যানুয়াল কাস্টমার / শপ যুক্ত করুন
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <TextField
              label="দোকানের নাম (Shop Name) *"
              fullWidth
              value={manualForm.shop_name}
              onChange={(e) => setManualForm({ ...manualForm, shop_name: e.target.value })}
            />
            <TextField
              label="মালিকের নাম (Owner Name)"
              fullWidth
              value={manualForm.owner_name}
              onChange={(e) => setManualForm({ ...manualForm, owner_name: e.target.value })}
            />
            <TextField
              label="ফোন নম্বর (Phone Number) *"
              fullWidth
              value={manualForm.phone}
              onChange={(e) => setManualForm({ ...manualForm, phone: e.target.value })}
            />
            <TextField
              label="ব্যবসার ধরন (Business Type)"
              fullWidth
              value={manualForm.business_type}
              onChange={(e) => setManualForm({ ...manualForm, business_type: e.target.value })}
            />
            <TextField
              label="প্যাকেজের নাম"
              fullWidth
              value={manualForm.plan_name}
              onChange={(e) => setManualForm({ ...manualForm, plan_name: e.target.value })}
            />
            <TextField
              label="বিশেষ নোট (Custom Notes)"
              multiline
              rows={2}
              fullWidth
              value={manualForm.custom_notes}
              onChange={(e) => setManualForm({ ...manualForm, custom_notes: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenManualModal(false)} sx={{ color: '#64748b' }}>
            বাতিল
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveManualShop}
            sx={{ bgcolor: '#059669', fontWeight: 600 }}
          >
            যোগ করুন
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
