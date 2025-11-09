import React from 'react';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import GitHubIcon from '@mui/icons-material/GitHub';
import TwitterIcon from '@mui/icons-material/Twitter';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import EmailIcon from '@mui/icons-material/Email';

const Footer = () => {
  const theme = useTheme();
  const { mode } = theme.palette;

  return (
    <Box>
      <Grid container spacing={4}>
        {/* Company Info */}
        <Grid item xs={12} sm={6} md={3}>
          <Box
            display={'flex'}
            component="a"
            href="/"
            title="Iotistic"
            width={120}
            marginBottom={2}
          >
            <Box
              component={'img'}
              src={
                mode === 'light'
                  ? '/logo-light.svg'
                  : '/logo-dark.svg'
              }
              height={1}
              width={1}
              alt="Iotistic Logo"
            />
          </Box>
          <Typography variant="body2" color="text.secondary" paragraph>
            Enterprise IoT Platform with Digital Twin Technology. Open-source,
            production-ready, and built for scale.
          </Typography>
          <Box display="flex" gap={1}>
            <IconButton
              aria-label="GitHub"
              href="https://github.com/dsamborschi/Iotistic-sensor"
              target="_blank"
              rel="noopener noreferrer"
              size="small"
            >
              <GitHubIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="Twitter"
              href="https://twitter.com/iotistic"
              target="_blank"
              rel="noopener noreferrer"
              size="small"
            >
              <TwitterIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="LinkedIn"
              href="https://linkedin.com/company/iotistic"
              target="_blank"
              rel="noopener noreferrer"
              size="small"
            >
              <LinkedInIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label="Email"
              href="mailto:info@iotistic.ca"
              size="small"
            >
              <EmailIcon fontSize="small" />
            </IconButton>
          </Box>
        </Grid>

        {/* Platform Links */}
        <Grid item xs={12} sm={6} md={2}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Platform
          </Typography>
          <Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/"
                color="text.primary"
                variant={'body2'}
              >
                Overview
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/features"
                color="text.primary"
                variant={'body2'}
              >
                Features
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/docs"
                color="text.primary"
                variant={'body2'}
              >
                Documentation
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/services"
                color="text.primary"
                variant={'body2'}
              >
                Pricing
              </Link>
            </Box>
          </Box>
        </Grid>

        {/* Resources Links */}
        <Grid item xs={12} sm={6} md={2}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Resources
          </Typography>
          <Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/docs#getting-started"
                color="text.primary"
                variant={'body2'}
              >
                Getting Started
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/docs#digital-twin"
                color="text.primary"
                variant={'body2'}
              >
                Digital Twins
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/docs#api-reference"
                color="text.primary"
                variant={'body2'}
              >
                API Reference
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="https://github.com/dsamborschi/Iotistic-sensor"
                target="_blank"
                rel="noopener noreferrer"
                color="text.primary"
                variant={'body2'}
              >
                GitHub
              </Link>
            </Box>
          </Box>
        </Grid>

        {/* Company Links */}
        <Grid item xs={12} sm={6} md={2}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Company
          </Typography>
          <Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/about"
                color="text.primary"
                variant={'body2'}
              >
                About Us
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/services#contact"
                color="text.primary"
                variant={'body2'}
              >
                Contact Sales
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/services#professional-services"
                color="text.primary"
                variant={'body2'}
              >
                Services
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/services#support"
                color="text.primary"
                variant={'body2'}
              >
                Support
              </Link>
            </Box>
          </Box>
        </Grid>

        {/* Legal Links */}
        <Grid item xs={12} sm={6} md={3}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Legal
          </Typography>
          <Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/privacy-policy"
                color="text.primary"
                variant={'body2'}
              >
                Privacy Policy
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/terms-of-service"
                color="text.primary"
                variant={'body2'}
              >
                Terms of Service
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/cookie-policy"
                color="text.primary"
                variant={'body2'}
              >
                Cookie Policy
              </Link>
            </Box>
            <Box marginBottom={1}>
              <Link
                underline="none"
                component="a"
                href="/license"
                color="text.primary"
                variant={'body2'}
              >
                Open Source License
              </Link>
            </Box>
          </Box>
        </Grid>
      </Grid>

      <Divider sx={{ my: 4 }} />

      {/* Bottom Bar */}
      <Box
        display={'flex'}
        justifyContent={'space-between'}
        alignItems={'center'}
        flexDirection={{ xs: 'column', sm: 'row' }}
        gap={2}
      >
        <Typography variant={'body2'} color="text.secondary">
          &copy; {new Date().getFullYear()} Iotistic. All rights reserved.
        </Typography>
        <Box display="flex" gap={3} flexWrap="wrap" justifyContent="center">
          <Link
            underline="none"
            component="a"
            href="/privacy-policy"
            color="text.secondary"
            variant={'caption'}
          >
            Privacy
          </Link>
          <Link
            underline="none"
            component="a"
            href="/terms-of-service"
            color="text.secondary"
            variant={'caption'}
          >
            Terms
          </Link>
          <Link
            underline="none"
            component="a"
            href="/cookie-policy"
            color="text.secondary"
            variant={'caption'}
          >
            Cookies
          </Link>
          <Link
            underline="none"
            component="a"
            href="https://github.com/dsamborschi/Iotistic-sensor/blob/master/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            color="text.secondary"
            variant={'caption'}
          >
            License
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default Footer;
