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
  Checkbox,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Alert,
  Tooltip,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import { Contact, ContactService } from '@/lib/api';

interface ContactManagerProps {
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

export default function ContactManager({ selectedIds, onSelectionChange }: ContactManagerProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [openAdd, setOpenAdd] = useState<boolean>(false);
  const [openImport, setOpenImport] = useState<boolean>(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await ContactService.list(search);
      setContacts(res.data);
    } catch (err: any) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [search]);

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      onSelectionChange(contacts.map((c) => c.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((item) => item !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleCreateContact = async () => {
    if (!name.trim() || !phone.trim()) {
      setError('নাম এবং ফোন নম্বর আবশ্যক');
      return;
    }
    setError(null);
    try {
      await ContactService.create({ name, phone, email, tags, notes });
      setOpenAdd(false);
      setName('');
      setPhone('');
      setEmail('');
      setTags('');
      setNotes('');
      fetchContacts();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to save contact');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('আপনি কি এই কন্টাক্ট মুছে ফেলতে চান?')) return;
    try {
      await ContactService.delete(id);
      onSelectionChange(selectedIds.filter((item) => item !== id));
      fetchContacts();
    } catch (err: any) {
      alert('Delete failed');
    }
  };

  const handleImportCsv = async () => {
    if (!csvFile) return;
    setLoading(true);
    try {
      const res = await ContactService.importCsv(csvFile);
      setImportStatus(`সফলভাবে ${res.data.imported} টি নতুন কন্টাক্ট এবং ${res.data.updated} টি আপডেট করা হয়েছে।`);
      setCsvFile(null);
      fetchContacts();
      setTimeout(() => {
        setOpenImport(false);
        setImportStatus(null);
      }, 2000);
    } catch (err: any) {
      setImportStatus(`ত্রুটি: ${err.message || 'Import failed'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, mb: 2.5, gap: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              কন্টাক্ট তালিকা ({contacts.length})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              মেসেজ পাঠানোর জন্য কন্টাক্ট সিলেক্ট করুন বা নতুন কন্টাক্ট যোগ করুন।
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={() => setOpenAdd(true)}
            >
              নতুন কন্টাক্ট
            </Button>
            <Button
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={() => setOpenImport(true)}
            >
              CSV ইমপোর্ট
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="নাম অথবা ফোন নম্বর দিয়ে খুঁজুন..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
            }}
          />
        </Box>

        {selectedIds.length > 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            বর্তমানে <b>{selectedIds.length}</b> জন কন্টাক্ট সিলেক্ট করা হয়েছে। আপনি চাইলে নিচে বাল্ক মেসেজ সেকশন থেকে এদের কাছে মেসেজ পাঠাতে পারেন।
          </Alert>
        )}

        <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, maxHeight: 420 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selectedIds.length > 0 && selectedIds.length < contacts.length}
                    checked={contacts.length > 0 && selectedIds.length === contacts.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>নাম</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ফোন নম্বর</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>ট্যাগ</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>নোট</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>অ্যাকশন</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    কোন কন্টাক্ট পাওয়া যায়নি।
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  return (
                    <TableRow key={c.id} hover selected={isSelected}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleSelectOne(c.id)}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{c.name || '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{c.phone || '—'}</TableCell>
                      <TableCell>
                        {c.tags ? (
                          c.tags.split(',').map((t, idx) => (
                            <Chip key={idx} label={t.trim()} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                          ))
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{c.notes || '—'}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="কন্টাক্ট মুছুন">
                          <IconButton size="small" color="error" onClick={() => handleDelete(c.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Add Contact Modal */}
        <Dialog open={openAdd} onClose={() => setOpenAdd(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>নতুন কন্টাক্ট যোগ করুন</DialogTitle>
          <DialogContent>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="নাম *"
                fullWidth
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="ফোন নম্বর (উদা: 01712345678 বা 88017...) *"
                fullWidth
                size="small"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <TextField
                label="ইমেইল (ঐচ্ছিক)"
                fullWidth
                size="small"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                label="ট্যাগ (কমা দিয়ে লিখুন, যেমন: VIP, Client)"
                fullWidth
                size="small"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <TextField
                label="নোট (ঐচ্ছিক)"
                fullWidth
                multiline
                rows={2}
                size="small"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenAdd(false)}>বাতিল</Button>
            <Button variant="contained" onClick={handleCreateContact}>সংরক্ষণ করুন</Button>
          </DialogActions>
        </Dialog>

        {/* CSV Import Modal */}
        <Dialog open={openImport} onClose={() => setOpenImport(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>CSV ফাইল থেকে কন্টাক্ট ইমপোর্ট</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              আপনার CSV ফাইলে <b>Name</b> এবং <b>Phone</b> কলাম থাকতে হবে (ঐচ্ছিক: Email, Tags, Notes)।
            </Typography>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
            />
            {importStatus && (
              <Alert severity="info" sx={{ mt: 2 }}>{importStatus}</Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenImport(false)}>বন্ধ করুন</Button>
            <Button
              variant="contained"
              onClick={handleImportCsv}
              disabled={!csvFile || loading}
            >
              ইমপোর্ট শুরু করুন
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
