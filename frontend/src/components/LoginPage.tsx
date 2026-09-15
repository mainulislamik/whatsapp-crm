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
  Paper,
} from '@mui/material';
import {
  WhatsApp as WhatsAppIcon,
  Person as PersonIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Key as KeyIcon,
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

  const fillCredentials = () => {
    setUsername('stockwhisk');
    setPassword('imontouhid4992');
    setError(null);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        backgroundImage: `radial-gradient(circle at 50% 50%, rgba(18, 140, 126, 0.15) 0%, rgba(15, 23, 42, 0.95) 70%)`,
      }}
    >
      <Card
        elevation={12}
        sx={{
          width: '100%',
          maxWidth: 440,
          borderRadius: 4,
          bgcolor: '#1e293b',
          borderColor: '#334155',
          borderWidth: 1,
          borderStyle: 'solid',
          color: '#ffffff',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header Branding */}
        <Box
          sx={{
            py: 4,
            px: 3,
            bgcolor: '#0b1120',
            borderBottom: '1px solid #334155',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 3,
              bgcolor: '#128C7E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(18, 140, 126, 0.5)',
              mb: 1.5,
            }}
          >
            <WhatsAppIcon sx={{ color: '#ffffff', fontSize: 36 }} />
          </Box>

          <Typography variant="h5" sx={{ fontWeight: 800, color: '#ffffff', letterSpacing: 0.5 }}>
            WhatsApp CRM
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            <Chip
              label="PRO v2.0"
              size="small"
              sx={{ bgcolor: 'rgba(37, 211, 102, 0.15)', color: '#25D366', fontWeight: 800, fontSize: '0.7rem' }}
            />
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
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
              sx={{ mb: 3, borderRadius: 2, bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}
            >
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 700, mb: 0.75, display: 'block' }}>
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
                        <PersonIcon sx={{ color: '#64748b' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2.5,
                      bgcolor: '#0f172a',
                      color: '#ffffff',
                      '& fieldset': { borderColor: '#334155' },
                      '&:hover fieldset': { borderColor: '#64748b' },
                      '&.Mui-focused fieldset': { borderColor: '#25D366' },
                    },
                  }}
                />
              </Box>

              <Box>
                <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 700, mb: 0.75, display: 'block' }}>
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
                        <LockIcon sx={{ color: '#64748b' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          sx={{ color: '#64748b' }}
                        >
                          {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2.5,
                      bgcolor: '#0f172a',
                      color: '#ffffff',
                      '& fieldset': { borderColor: '#334155' },
                      '&:hover fieldset': { borderColor: '#64748b' },
                      '&.Mui-focused fieldset': { borderColor: '#25D366' },
                    },
                  }}
                />
              </Box>

              {/* Quick autofill helper badge */}
              <Paper
                onClick={fillCredentials}
                elevation={0}
                sx={{
                  p: 1.25,
                  bgcolor: '#0f172a',
                  border: '1px dashed #334155',
                  borderRadius: 2,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#1e293b', borderColor: '#25D366' },
                  transition: 'all 0.2s ease',
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <KeyIcon sx={{ color: '#25D366', fontSize: 18 }} />
                  <Typography variant="caption" sx={{ color: '#94a3b8', flexGrow: 1 }}>
                    Quick Fill Demo Credentials
                  </Typography>
                  <Chip
                    label="stockwhisk"
                    size="small"
                    sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#334155', color: '#cbd5e1' }}
                  />
                </Stack>
              </Paper>

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  py: 1.5,
                  borderRadius: 2.5,
                  bgcolor: '#25D366',
                  color: '#0f172a',
                  fontWeight: 800,
                  fontSize: '1rem',
                  textTransform: 'none',
                  boxShadow: '0 4px 14px rgba(37, 211, 102, 0.4)',
                  '&:hover': {
                    bgcolor: '#1DB954',
                    boxShadow: '0 6px 18px rgba(37, 211, 102, 0.6)',
                  },
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In to Dashboard'}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}