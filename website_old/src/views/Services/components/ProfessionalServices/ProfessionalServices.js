import React from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import EngineeringIcon from '@mui/icons-material/Engineering';
import SchoolIcon from '@mui/icons-material/School';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SecurityIcon from '@mui/icons-material/Security';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';

const services = [
  {
    icon: EngineeringIcon,
    title: 'Architecture Consulting',
    description: 'Custom system design for your specific requirements',
    details: [
      'Multi-site deployment planning',
      'Scalability assessment',
      'Performance optimization',
      'Technology stack recommendations',
    ],
    pricing: '$200/hour',
  },
  {
    icon: CloudUploadIcon,
    title: 'Deployment Services',
    description: 'Professional installation and configuration',
    details: [
      'Remote or on-site deployment',
      'Multi-device fleet setup',
      'Network configuration',
      'Health check and testing',
    ],
    pricing: 'From $2,500',
  },
  {
    icon: IntegrationInstructionsIcon,
    title: 'Custom Integration',
    description: 'Connect to your existing systems and APIs',
    details: [
      'ERP/CRM integration',
      'Third-party API connectors',
      'Custom data pipelines',
      'Webhook development',
    ],
    pricing: '$150/hour',
  },
  {
    icon: SchoolIcon,
    title: 'Training & Workshops',
    description: 'Hands-on training for your team',
    details: [
      'Platform administration',
      'Node-RED flow development',
      'Grafana dashboard creation',
      'ML model training',
    ],
    pricing: '$1,500/day',
  },
  {
    icon: SecurityIcon,
    title: 'Security Audit',
    description: 'Comprehensive security assessment',
    details: [
      'Vulnerability scanning',
      'Penetration testing',
      'Compliance review (GDPR, SOC 2)',
      'Security hardening',
    ],
    pricing: 'From $5,000',
  },
  {
    icon: SupportAgentIcon,
    title: 'Managed Services',
    description: 'We handle everything for you',
    details: [
      '24/7 monitoring',
      'Proactive maintenance',
      'Performance optimization',
      'Monthly reporting',
    ],
    pricing: 'Custom pricing',
  },
];

const ProfessionalServices = () => {
  const theme = useTheme();

  return (
    <Box py={8}>
      <Box textAlign="center" marginBottom={6}>
        <Typography variant="h3" fontWeight={700} gutterBottom>
          Professional Services
        </Typography>
        <Typography variant="h6" color="text.secondary" maxWidth={700} mx="auto">
          Expert help for deployment, integration, and optimization. Our team has 10+ years 
          of experience in IoT and embedded systems.
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {services.map((service, index) => {
          const Icon = service.icon;
          
          return (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card
                sx={{
                  height: '100%',
                  '&:hover': {
                    boxShadow: 8,
                    transform: 'translateY(-4px)',
                  },
                  transition: 'all 0.3s ease-in-out',
                }}
              >
                <CardContent>
                  <Box display="flex" flexDirection="column" alignItems="center" textAlign="center">
                    <Icon 
                      sx={{ 
                        fontSize: 50, 
                        color: theme.palette.primary.main, 
                        mb: 2,
                      }} 
                    />
                    
                    <Typography variant="h5" fontWeight={700} gutterBottom>
                      {service.title}
                    </Typography>
                    
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {service.description}
                    </Typography>

                    <Box component="ul" sx={{ textAlign: 'left', pl: 3, mb: 2 }}>
                      {service.details.map((detail, i) => (
                        <Typography component="li" variant="body2" key={i} sx={{ mb: 0.5 }}>
                          {detail}
                        </Typography>
                      ))}
                    </Box>

                    <Box
                      sx={{
                        mt: 'auto',
                        pt: 2,
                        borderTop: `1px solid ${theme.palette.divider}`,
                        width: '100%',
                        textAlign: 'center',
                      }}
                    >
                      <Typography variant="h6" color="primary" fontWeight={700}>
                        {service.pricing}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Box
        textAlign="center"
        mt={6}
        p={4}
        sx={{
          bgcolor: theme.palette.primary.main,
          color: 'white',
          borderRadius: 2,
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Need a Custom Solution?
        </Typography>
        <Typography variant="body1" paragraph>
          We offer tailored packages for unique requirements. Contact our sales team for a 
          personalized quote.
        </Typography>
        <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
          <Typography variant="body2">
            📧 sales@iotistic.ca
          </Typography>
          <Typography variant="body2">
            📞 +1 (555) 123-4567
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default ProfessionalServices;
