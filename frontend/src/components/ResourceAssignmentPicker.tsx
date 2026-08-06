import React, { useEffect, useMemo, useState } from 'react';
import {
  TextField, Button, Spinner, Text, Tag, Banner, BlockStack, InlineStack,
  Checkbox, Box, Divider,
} from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';

/**
 * ResourceAssignmentPicker
 * ------------------------
 * Inline picker for the "Assign To" section of the upload-field form. Replaces
 * the old dead-end banner ("assign … from the field detail page") — there was
 * no field detail page, so specific products / variants / collections could
 * never actually be chosen.
 *
 * It talks to endpoints the backend already exposes:
 *   GET /products/search?q=&limit=   → Product[] (each with variants[])
 *   GET /products/collections        → { id, title }[]
 *
 * Selected ids are stored on the field's `assignedResourceIds` (string[]),
 * which the entity and storefront matching already support.
 *
 * `mode` decides what the merchant is selecting:
 *   'product'    → product ids
 *   'variant'    → variant ids (products expand to show their variants)
 *   'collection' → collection ids
 */

type Mode = 'product' | 'variant' | 'collection';

interface Variant { id: string; title: string; }
interface Product {
  id: string;
  shopifyProductId: string;
  title: string;
  imageUrl?: string | null;
  variants?: Variant[] | null;
}
interface Collection { id: string; title: string; }

interface Props {
  mode: Mode;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ResourceAssignmentPicker({ mode, selectedIds, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce the search box so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const isCollection = mode === 'collection';

  const productsQuery = useQuery({
    queryKey: ['assign-products', debounced],
    queryFn: () =>
      api
        .get(`/products/search`, { params: { q: debounced, limit: 30 } })
        .then((r) => (r.data.data ?? r.data) as Product[]),
    enabled: !isCollection,
  });

  const collectionsQuery = useQuery({
    queryKey: ['assign-collections'],
    queryFn: () =>
      api.get(`/products/collections`).then((r) => (r.data.data ?? r.data) as Collection[]),
    enabled: isCollection,
  });

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next]);
  };

  // ---- labels, so selected chips read nicely even before results load ----
  const labelForId = useMemo(() => {
    const map = new Map<string, string>();
    if (isCollection) {
      (collectionsQuery.data ?? []).forEach((c) => map.set(String(c.id), c.title));
    } else {
      (productsQuery.data ?? []).forEach((p) => {
        map.set(String(p.shopifyProductId), p.title);
        (p.variants ?? []).forEach((v) =>
          map.set(String(v.id), `${p.title} — ${v.title}`),
        );
      });
    }
    return map;
  }, [isCollection, productsQuery.data, collectionsQuery.data]);

  const heading =
    mode === 'product' ? 'Products' : mode === 'variant' ? 'Product Variants' : 'Collections';
  const helper =
    mode === 'product'
      ? 'Show this field only on the selected products.'
      : mode === 'variant'
        ? 'Show this field only for the selected variants.'
        : 'Show this field only on products in the selected collections.';

  const isLoading = isCollection ? collectionsQuery.isLoading : productsQuery.isLoading;
  const isError = isCollection ? collectionsQuery.isError : productsQuery.isError;

  return (
    <BlockStack gap="300">
      <BlockStack gap="100">
        <Text variant="bodyMd" as="p" fontWeight="semibold">{heading}</Text>
        <Text variant="bodySm" tone="subdued" as="p">{helper}</Text>
      </BlockStack>

      {/* selected chips */}
      {selectedIds.length > 0 && (
        <InlineStack gap="200" wrap>
          {selectedIds.map((id) => (
            <Tag key={id} onRemove={() => toggle(id)}>
              {labelForId.get(String(id)) ?? id}
            </Tag>
          ))}
        </InlineStack>
      )}

      {!isCollection && (
        <TextField
          label=""
          labelHidden
          value={query}
          onChange={setQuery}
          placeholder={`Search ${mode === 'variant' ? 'products' : 'products'} by title…`}
          autoComplete="off"
          clearButton
          onClearButtonClick={() => setQuery('')}
        />
      )}

      {isError && (
        <Banner tone="warning">
          Couldn't load {isCollection ? 'collections' : 'products'}. If your catalogue was
          just installed, open <b>Products → Sync</b> once, then try again.
        </Banner>
      )}

      {isLoading ? (
        <Box padding="400"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>
      ) : (
        <div
          style={{
            border: '1px solid var(--p-color-border, #e1e3e5)',
            borderRadius: '8px',
            padding: '8px',
            maxHeight: '320px',
            overflowY: 'auto',
          }}
        >
          {isCollection ? (
            <CollectionList
              collections={collectionsQuery.data ?? []}
              selected={selected}
              onToggle={toggle}
            />
          ) : (
            <ProductList
              products={productsQuery.data ?? []}
              mode={mode}
              selected={selected}
              onToggle={toggle}
            />
          )}
        </div>
      )}
    </BlockStack>
  );
}

function CollectionList({
  collections, selected, onToggle,
}: {
  collections: Collection[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (!collections.length) {
    return <Text as="p" tone="subdued">No collections found.</Text>;
  }
  return (
    <BlockStack gap="100">
      {collections.map((c) => (
        <Checkbox
          key={c.id}
          label={c.title}
          checked={selected.has(String(c.id))}
          onChange={() => onToggle(String(c.id))}
        />
      ))}
    </BlockStack>
  );
}

function ProductList({
  products, mode, selected, onToggle,
}: {
  products: Product[];
  mode: Mode;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (!products.length) {
    return <Text as="p" tone="subdued">No products found. Try a different search.</Text>;
  }
  return (
    <BlockStack gap="200">
      {products.map((p, idx) => (
        <BlockStack key={p.id} gap="100">
          {idx > 0 && <Divider />}
          {mode === 'product' ? (
            <Checkbox
              label={p.title}
              checked={selected.has(String(p.shopifyProductId))}
              onChange={() => onToggle(String(p.shopifyProductId))}
            />
          ) : (
            <BlockStack gap="050">
              <Text as="p" fontWeight="semibold" variant="bodySm">{p.title}</Text>
              {(p.variants ?? []).length === 0 ? (
                <Text as="p" tone="subdued" variant="bodySm">No variants</Text>
              ) : (
                <Box paddingInlineStart="300">
                  <BlockStack gap="050">
                    {(p.variants ?? []).map((v) => (
                      <Checkbox
                        key={v.id}
                        label={v.title}
                        checked={selected.has(String(v.id))}
                        onChange={() => onToggle(String(v.id))}
                      />
                    ))}
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          )}
        </BlockStack>
      ))}
    </BlockStack>
  );
}
