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
  Tooltip,
  LinearProgress,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import SearchIcon from '@mui/icons-material/Search';
import { Contact, ContactService } from '@/lib/api';

interface ContactManagerProps {
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

export default function ContactManager({
  selectedIds,
  onSelectionChange,
}: ContactManagerProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [openAddDialog, setOpenAddDialog] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Form State
  const [formName, setFormName] = useState<string>('');
  const [formPhone, setFormPhone] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formTags, setFormTags] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');

  const fetchContactsAndTags = async () => {
    setLoading(true);
    try {
      const [contactsRes, tagsRes] = await Promise.all([
        ContactService.list(),
        ContactService.getTags(),
      ]);
      setContacts(contactsRes.data);
      setTags(tagsRes.data);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContactsAndTags();
  }, []);

  const handleCreateContact = async () => {
    if (!formName.trim() || !formPhone.trim()) {
      alert('Name and Phone number are required.');
      return;
    }
    try {
      await ContactService.create({
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim() || undefined,
        tags: formTags.trim(),
        notes: formNotes.trim(),
      });
      setOpenAddDialog(false);
      setFormName('');
      setFormPhone('');
      setFormEmail('');
      setFormTags('');
      setFormNotes('');
      fetchContactsAndTags();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save contact');
    }
  };

  const handleDeleteContact = async (id: number) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await ContactService.delete(id);
      onSelectionChange(selectedIds.filter((item) => item !== id));
      fetchContactsAndTags();
    } catch (err) {
      alert('Delete failed');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allFilteredIds = filteredContacts.map((c) => c.id);
      const combined = Array.from(new Set([...selectedIds, ...allFilteredIds]));
      onSelectionChange(combined);
    } else {
      const filteredSet = new Set(filteredContacts.map((c) => c.id));
      onSelectionChange(selectedIds.filter((id) => !filteredSet.has(id)));
    }
  };

  const handleSelectTagGroup = (tag: string) => {
    const taggedIds = contacts
      .filter((c) => c.tags?.split(',').map((t) => t.trim().toLowerCase()).includes(tag.toLowerCase()))
      .map((c) => c.id);
    const combined = Array.from(new Set([...selectedIds, ...taggedIds]));
    onSelectionChange(combined);
  };

  const handleToggleOne = (id: number) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((item) => item !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const res = await ContactService.importCsv(file);
      alert(`CSV imported: ${res.data.imported} added, ${res.data.skipped} duplicates skipped.`);
      fetchContactsAndTags();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'CSV Import failed');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleDownloadSampleCsv = () => {
    const sample = 'name,phone,email,tags,notes\nRahim Khan,01700000001,rahim@example.com,"VIP, Wholesaler",Regular client\nKarim Ahmed,01800000002,karim@example.com,Retail,Cash payment';
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'whatsapp_contacts_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.tags && c.tags.toLowerCase().includes(search.toLowerCase()));

    const matchesTag =
      !selectedTag ||
      (c.tags &&
        c.tags
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .includes(selectedTag.toLowerCase()));

    return matchesSearch && matchesTag;
  });

  const isAllSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every((c) => selectedIds.includes(c.id));

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        {/* Header Row */}
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2, gap: 1.5 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PeopleIcon color="primary" /> Contact Directory & Audience
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage, search, filter, and import your contacts.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<PersonAddIcon />}
              onClick={() => setOpenAddDialog(true)}
              sx={{ fontWeight: 700 }}
            >
              Add Contact
            </Button>
            <Button
              component="label"
              variant="outlined"
              color="secondary"
              size="small"
              startIcon={<UploadFileIcon />}
              sx={{ fontWeight: 700 }}
            >
              Import CSV
              <input type="file" hidden accept=".csv" onChange={handleCsvUpload} />
            </Button>
            <Tooltip title="Download CSV template format">
              <IconButton size="small" onClick={handleDownloadSampleCsv}>
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        {/* Tag Audience Filters */}
        {tags.length > 0 && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                  Filter by Tag:
                </Typography>
                <Chip
                  label={`All (${contacts.length})`}
                  size="small"
                  clickable
                  color={selectedTag === '' ? 'primary' : 'default'}
                  onClick={() => setSelectedTag('')}
                  sx={{ fontWeight: 600 }}
                />
                {tags.map((t) => (
                  <Chip
                    key={t.tag}
                    label={`${t.tag} (${t.count})`}
                    size="small"
                    clickable
                    color={selectedTag === t.tag ? 'primary' : 'default'}
                    onClick={() => setSelectedTag(t.tag === selectedTag ? '' : t.tag)}
                    sx={{ fontWeight: 600 }}
                  />
                ))}
              </Stack>

              {selectedTag && (
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  onClick={() => handleSelectTagGroup(selectedTag)}
                  sx={{ fontSize: '0.78rem', fontWeight: 700 }}
                >
                  Select All in "{selectedTag}"
                </Button>
              )}
            </Stack>
          </Box>
        )}

        {/* Search & Selection Bar */}
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2, gap: 1.5 }}>
          <TextField
            size="small"
            placeholder="Search by name, phone, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
            sx={{ width: { xs: '100%', sm: 300 } }}
          />

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip
              label={`${selectedIds.length} Selected`}
              color={selectedIds.length > 0 ? 'primary' : 'default'}
              sx={{ fontWeight: 700 }}
            />
            {selectedIds.length > 0 && (
              <Button size="small" color="inherit" onClick={() => onSelectionChange([])}>
                Clear Selection
              </Button>
            )}
          </Stack>
        </Stack>

        {loading && <LinearProgress sx={{ mb: 1.5 }} />}

        {/* Contacts Table */}
        <TableContainer sx={{ border: '1px solid #e2e8f0', borderRadius: 2, maxHeight: 440 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={selectedIds.length > 0 && !isAllSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Phone Number</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Tags / Group</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No contacts found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredContacts.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  return (
                    <TableRow key={c.id} hover selected={isSelected}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleToggleOne(c.id)}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{c.phone}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{c.email || '—'}</TableCell>
                      <TableCell>
                        {c.tags
                          ? c.tags.split(',').map((tag) => (
                              <Chip
                                key={tag.trim()}
                                label={tag.trim()}
                                size="small"
                                variant="outlined"
                                sx={{ mr: 0.5, mb: 0.5, fontSize: '0.72rem' }}
                              />
                            ))
                          : '—'}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.notes || '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Delete contact">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteContact(c.id)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
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
        <Dialog open={openAddDialog} onClose={() => setOpenAddDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Add New Contact</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Full Name *"
                fullWidth
                size="small"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              <TextField
                label="Phone Number * (e.g. 01712345678 or 88017...)"
                fullWidth
                size="small"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
              <TextField
                label="Email (Optional)"
                fullWidth
                size="small"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
              <TextField
                label="Tags / Groups (Comma separated, e.g. VIP, Wholesaler)"
                fullWidth
                size="small"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
              />
              <TextField
                label="Notes (Optional)"
                fullWidth
                multiline
                rows={2}
                size="small"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenAddDialog(false)}>Cancel</Button>
            <Button variant="contained" color="primary" onClick={handleCreateContact}>
              Save Contact
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
}
