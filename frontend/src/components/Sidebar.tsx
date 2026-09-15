'use client';

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  Stack,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import CampaignIcon from '@mui/icons-material/Campaign';
import ChatIcon from '@mui/icons-material/Chat';
import DescriptionIcon from '@mui/icons-material/Description';
import AssessmentIcon from '@mui/icons-material/Assessment';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

export interface NavItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
}

export const navItems: NavItem[] = [
  { id: 'overview', label: 'ড্যাশবোর্ড ওভারভিউ', sublabel: 'সামারি ও মেট্রিক্স', icon: <DashboardIcon /> },
  { id: 'contacts', label: 'কন্টাক্টস ও অডিয়েন্স', sublabel: 'ফিল্টার ও ইমপোর্ট', icon: <PeopleIcon /> },
  { id: 'broadcast', label: 'বাল্ক ব্রডকাস্ট', sublabel: 'মিডিয়া ও স্পিনট্যাক্স', icon: <CampaignIcon /> },
  { id: 'quickchat', label: 'সরাসরি কুইক মেসেজ', sublabel: '১-টু-১ তাৎক্ষণিক মেসেজ', icon: <ChatIcon /> },
  { id: 'templates', label: 'মেসেজ টেমপ্লেটস', sublabel: 'সংরক্ষিত মেসেজ লাইব্রেরি', icon: <DescriptionIcon /> },
  { id: 'reports', label: 'রিপোর্ট ও ডেলিভারি লগ', sublabel: 'CSV এক্সপোর্ট সহ', icon: <AssessmentIcon /> },
  { id: 'device', label: 'WhatsApp ডিভাইস লিঙ্ক', sublabel: 'QR কোড ও কানেকশন', icon: <QrCode2Icon /> },
];

interface SidebarProps {
  currentSection: string;
  onSelectSection: (section: string) => void;
  waStatus?: { status: string; user?: any; hasQr: boolean } | null;
  onCloseMobile?: () => void;
}

export default function Sidebar({
  currentSection,
  onSelectSection,
  waStatus,
  onCloseMobile,
}: SidebarProps) {
  const isConnected = waStatus?.status === 'CONNECTED';
  const isScanQr = waStatus?.status === 'SCAN_QR';

  const handleClick = (id: string) => {
    onSelectSection(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <Box
      sx={{
        width: { xs: 280, md: 280 },
        height: '100%',
        bgcolor: '#0f172a',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Brand Header */}
      <Box sx={{ p: 2.5, borderBottom: '1px solid #1e293b' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              bgcolor: '#128C7E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(18, 140, 126, 0.4)',
            }}
          >
            <WhatsAppIcon sx={{ color: '#ffffff', fontSize: 26 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
              WhatsApp CRM
            </Typography>
            <Typography variant="caption" sx={{ color: '#25D366', fontWeight: 700, letterSpacing: 0.5 }}>
              PRO v2.0
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* Navigation Links */}
      <Box sx={{ flexGrow: 1, py: 2, px: 1.5, overflowY: 'auto' }}>
        <List disablePadding>
          {navItems.map((item) => {
            const active = currentSection === item.id;
            return (
              <ListItem key={item.id} disablePadding sx={{ mb: 0.8 }}>
                <ListItemButton
                  onClick={() => handleClick(item.id)}
                  sx={{
                    borderRadius: 2,
                    py: 1.2,
                    px: 1.5,
                    bgcolor: active ? '#1e293b' : 'transparent',
                    borderLeft: active ? '4px solid #25D366' : '4px solid transparent',
                    '&:hover': {
                      bgcolor: active ? '#1e293b' : 'rgba(255, 255, 255, 0.05)',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 38,
                      color: active ? '#25D366' : '#94a3b8',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: active ? 700 : 500,
                          color: active ? '#ffffff' : '#cbd5e1',
                        }}
                      >
                        {item.label}
                      </Typography>
                    }
                    secondary={
                      item.sublabel && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: active ? '#94a3b8' : '#64748b',
                            fontSize: '0.72rem',
                          }}
                        >
                          {item.sublabel}
                        </Typography>
                      )
                    }
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      <Divider sx={{ borderColor: '#1e293b' }} />

      {/* Footer Connection Status */}
      <Box sx={{ p: 2, bgcolor: '#0b1120' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: isConnected ? '#10b981' : isScanQr ? '#f59e0b' : '#ef4444',
              boxShadow: isConnected ? '0 0 8px #10b981' : 'none',
            }}
          />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', fontWeight: 600 }}>
              কানেকশন স্ট্যাটাস
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: '#ffffff',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '0.8rem',
              }}
            >
              {isConnected ? 'অনলাইন / সংযুক্ত' : isScanQr ? 'QR স্ক্যান প্রয়োজন' : 'ডিসকানেক্টেড'}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
