import React from 'react';
import { Page, Layout, Card, EmptyState, Button, Text } from '@shopify/polaris';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches uncaught render errors anywhere below it — including known,
 * intermittent Polaris internal issues (e.g. the well-documented
 * "Polaris.ResourceList.a11yCheckboxSelectAllMultiple" translation error,
 * reported against many unrelated apps/versions since 2020) — and shows a
 * friendly retry screen instead of leaving the page fully blank.
 *
 * Without this, ANY uncaught render error anywhere in the tree unmounts the
 * ENTIRE React root with no fallback, which is exactly what produced the
 * blank-page symptom inside the Shopify admin iframe.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error caught by ErrorBoundary:', error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Page>
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Something went wrong"
                  action={{ content: 'Try again', onAction: this.handleRetry }}
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <Text as="p">
                    This page hit an unexpected error. Click "Try again" to reload it — if this
                    keeps happening, let us know via Settings.
                  </Text>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      );
    }
    return this.props.children;
  }
}
