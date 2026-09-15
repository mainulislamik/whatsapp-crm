'use client';

import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  InputAdornment,
  IconButton,
  Alert,
  CircularProgress,
  Stack,
  Chip,
} from '@mui/material';
import {
  WhatsApp as WhatsAppIcon,
  Person as PersonIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';
import { AuthService } from '@/lib/api';

interface LoginPageProps {
  onLoginSuccess: (user: { username: string; name: string; token: string }) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await AuthService.login({
        username: username.trim(),
        password: password.trim(),
      });

      if (res.data.success && res.data.token) {
        localStorage.setItem('wa_crm_token', res.data.token);
        localStorage.setItem('wa_crm_user', JSON.stringify({
          username: res.data.username,
          name: res.data.name,
        }));
        onLoginSuccess({
          username: res.data.username,
          name: res.data.name,
          token: res.data.token,
        });
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err?.response?.status === 401) {
        setError('Invalid username or password. Please try again.');
      } else {
        setError('Connection failed. Please check backend server.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-50/60 via-slate-50 to-slate-100">
      <Card
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 4,
          bgcolor: '#ffffff',
          borderColor: '#e2e8f0',
          borderWidth: 1,
          borderStyle: 'solid',
          color: '#0f172a',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.05), 0 8px 10px -6px rgba(15, 23, 42, 0.03)',
        }}
      >
        {/* Header Branding */}
        <Box
          sx={{
            py: 4,
            px: 3,
            bgcolor: '#ffffff',
            borderBottom: '1px solid #f1f5f9',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div className="w-14 h-14 rounded-2xl bg-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-700/20 mb-3">
            <WhatsAppIcon sx={{ color: '#ffffff', fontSize: 36 }} />
          </div>

          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: 0.5 }}>
            WhatsApp CRM
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            <Chip
              label="PRO v2.0"
              size="small"
              sx={{ bgcolor: 'rgba(18, 140, 126, 0.1)', color: '#128C7E', fontWeight: 800, fontSize: '0.7rem' }}
            />
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
              Secure Admin Login
            </Typography>
          </Stack>
        </Box>

        {/* Form Body */}
        <CardContent sx={{ p: 3.5 }}>
          {error && (
            <Alert
              severity="error"
              onClose={() => setError(null)}
              sx={{ mb: 3, borderRadius: 2.5, bgcolor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}
            >
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="caption" sx={{ color: '#334155', fontWeight: 700, mb: 0.75, display: 'block' }}>
                  Username
                </Typography>
                <TextField
                  fullWidth
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonIcon sx={{ color: '#94a3b8' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2.5,
                      bgcolor: '#f8fafc',
                      color: '#0f172a',
                      '& fieldset': { borderColor: '#e2e8f0' },
                      '&:hover fieldset': { borderColor: '#cbd5e1' },
                      '&.Mui-focused fieldset': { borderColor: '#128C7E', borderWidth: 2 },
                    },
                  }}
                />
              </Box>

              <Box>
                <Typography variant="caption" sx={{ color: '#334155', fontWeight: 700, mb: 0.75, display: 'block' }}>
                  Password
                </Typography>
                <TextField
                  fullWidth
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockIcon sx={{ color: '#94a3b8' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          sx={{ color: '#94a3b8' }}
                        >
                          {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2.5,
                      bgcolor: '#f8fafc',
                      color: '#0f172a',
                      '& fieldset': { borderColor: '#e2e8f0' },
                      '&:hover fieldset': { borderColor: '#cbd5e1' },
                      '&.Mui-focused fieldset': { borderColor: '#128C7E', borderWidth: 2 },
                    },
                  }}
                />
              </Box>

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  py: 1.5,
                  borderRadius: 2.5,
                  bgcolor: '#128C7E',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '1rem',
                  textTransform: 'none',
                  boxShadow: '0 4px 14px rgba(18, 140, 126, 0.3)',
                  '&:hover': {
                    bgcolor: '#0f766e',
                    boxShadow: '0 6px 18px rgba(18, 140, 126, 0.4)',
                  },
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In to Dashboard'}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}