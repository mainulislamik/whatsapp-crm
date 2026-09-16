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
import StorefrontIcon from '@mui/icons-material/Storefront';
import MarkChatReadIcon from '@mui/icons-material/MarkChatRead';

export interface NavItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
}

export const navItems: NavItem[] = [
  { id: 'overview', label: 'Dashboard Overview', sublabel: 'Summary & Metrics', icon: <DashboardIcon /> },
  { id: 'leads', label: 'Lead Management', sublabel: 'Shops & WhatsApp Scan', icon: <StorefrontIcon /> },
  { id: 'broadcast', label: 'Bulk Broadcast', sublabel: 'Media & Spintax', icon: <CampaignIcon /> },
  { id: 'livechat', label: 'Live Chat', sublabel: 'Real-time Conversations', icon: <MarkChatReadIcon /> },
  { id: 'quickchat', label: 'Direct Quick Send', sublabel: '1-to-1 Instant Message', icon: <ChatIcon /> },
  { id: 'templates', label: 'Message Templates', sublabel: 'Saved Message Library', icon: <DescriptionIcon /> },
  { id: 'reports', label: 'Reports & Delivery Logs', sublabel: 'With CSV Export', icon: <AssessmentIcon /> },
  { id: 'device', label: 'WhatsApp Device Link', sublabel: 'QR Code & Connection', icon: <QrCode2Icon /> },
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
        bgcolor: '#ffffff',
        color: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #e2e8f0',
      }}
    >
      {/* Brand Header */}
      <Box sx={{ p: 2.5, borderBottom: '1px solid #f1f5f9', bgcolor: '#ffffff' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              bgcolor: '#128C7E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(18, 140, 126, 0.25)',
            }}
          >
            <WhatsAppIcon sx={{ color: '#ffffff', fontSize: 26 }} />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              WhatsApp CRM
            </Typography>
            <Typography variant="caption" sx={{ color: '#128C7E', fontWeight: 800, letterSpacing: 0.5 }}>
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
                    borderRadius: 2.5,
                    py: 1.2,
                    px: 1.5,
                    bgcolor: active ? 'rgba(18, 140, 126, 0.08)' : 'transparent',
                    borderLeft: active ? '4px solid #128C7E' : '4px solid transparent',
                    '&:hover': {
                      bgcolor: active ? 'rgba(18, 140, 126, 0.12)' : '#f8fafc',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 38,
                      color: active ? '#128C7E' : '#64748b',
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: active ? 800 : 600,
                          color: active ? '#128C7E' : '#334155',
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
                            color: active ? '#0f766e' : '#94a3b8',
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

      <Divider sx={{ borderColor: '#f1f5f9' }} />

      {/* Footer Connection Status */}
      <Box sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: isConnected ? '#10b981' : isScanQr ? '#f59e0b' : '#ef4444',
              boxShadow: isConnected ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
            }}
          />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', fontWeight: 600 }}>
              Engine Status
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: '#0f172a',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: '0.8rem',
              }}
            >
              {isConnected ? 'Online / Connected' : isScanQr ? 'QR Scan Required' : 'Disconnected'}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}