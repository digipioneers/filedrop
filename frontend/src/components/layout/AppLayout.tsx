import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Frame, Navigation, TopBar } from '@shopify/polaris';
import {
  HomeIcon,
  ArrowUpIcon,
  ProductIcon,
  OrderIcon,
  CreditCardIcon,
  SettingsIcon,
} from '@shopify/polaris-icons';

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavActive, setMobileNavActive] = React.useState(false);

  const isSelected = (path: string) =>
    location.pathname.startsWith(`/app${path}`);

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        items={[
          {
            url: '/app',
            exactMatch: true,
            label: 'Dashboard',
            icon: HomeIcon,
            selected: location.pathname === '/app',
            onClick: () => navigate('/app'),
          },
          {
            url: '/app/fields',
            label: 'Upload Fields',
            icon: ArrowUpIcon,
            selected: isSelected('/fields'),
            onClick: () => navigate('/app/fields'),
          },
          {
            url: '/app/uploads',
            label: 'All Uploads',
            icon: ProductIcon,
            selected: isSelected('/uploads'),
            onClick: () => navigate('/app/uploads'),
          },
          {
            url: '/app/orders',
            label: 'Orders',
            icon: OrderIcon,
            selected: isSelected('/orders'),
            onClick: () => navigate('/app/orders'),
          },
          {
            url: '/app/analytics',
            label: 'Analytics',
            icon: ProductIcon,
            selected: isSelected('/analytics'),
            onClick: () => navigate('/app/analytics'),
          },
        ]}
      />
      <Navigation.Section
        title="Account"
        separator
        items={[
          {
            url: '/app/billing',
            label: 'Plan & Billing',
            icon: CreditCardIcon,
            selected: isSelected('/billing'),
            onClick: () => navigate('/app/billing'),
          },
          {
            url: '/app/settings',
            label: 'Settings',
            icon: SettingsIcon,
            selected: isSelected('/settings'),
            onClick: () => navigate('/app/settings'),
          },
        ]}
      />
    </Navigation>
  );

  return (
    <Frame
      topBar={
        <TopBar
          showNavigationToggle
          onNavigationToggle={() => setMobileNavActive(v => !v)}
        />
      }
      navigation={navigationMarkup}
      showMobileNavigation={mobileNavActive}
      onNavigationDismiss={() => setMobileNavActive(false)}
    >
      <Outlet />
    </Frame>
  );
}
