import React, { useState, useCallback } from 'react';
import {
  Combobox, Listbox, Tag, InlineStack, Text, Spinner, EmptySearchResult,
} from '@shopify/polaris';
import { useProductSearch } from '../../hooks/useProducts';

interface ProductPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function ProductPicker({ selectedIds, onChange, placeholder = 'Search products...' }: ProductPickerProps) {
  const [query, setQuery] = useState('');
  const { data: products = [], isLoading } = useProductSearch(query, query.length >= 2);

  const handleSelect = useCallback(
    (productId: string) => {
      if (selectedIds.includes(productId)) {
        onChange(selectedIds.filter((id) => id !== productId));
      } else {
        onChange([...selectedIds, productId]);
      }
      setQuery('');
    },
    [selectedIds, onChange],
  );

  const handleRemove = (id: string) => onChange(selectedIds.filter((sid) => sid !== id));

  const selectedLabels = selectedIds.map((id) => {
    const p = products.find((pr) => pr.shopifyProductId === id);
    return p ? p.title : id;
  });

  return (
    <div>
      <Combobox
        activator={
          <Combobox.TextField
            label="Products"
            labelHidden
            value={query}
            onChange={setQuery}
            placeholder={placeholder}
            autoComplete="off"
          />
        }
      >
        {isLoading ? (
          <Listbox>
            <Listbox.Loading accessibilityLabel="Loading products" />
          </Listbox>
        ) : products.length === 0 && query.length >= 2 ? (
          <Listbox>
            <EmptySearchResult title="No products found" description="" withIllustration={false} />
          </Listbox>
        ) : products.length > 0 ? (
          <Listbox onSelect={handleSelect}>
            {products.map((p) => (
              <Listbox.Option
                key={p.shopifyProductId}
                value={p.shopifyProductId}
                selected={selectedIds.includes(p.shopifyProductId)}
                accessibilityLabel={p.title}
              >
                {p.title}
              </Listbox.Option>
            ))}
          </Listbox>
        ) : null}
      </Combobox>

      {selectedIds.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <InlineStack gap="200" wrap>
            {selectedIds.map((id, i) => (
              <Tag key={id} onRemove={() => handleRemove(id)}>
                {selectedLabels[i] || id}
              </Tag>
            ))}
          </InlineStack>
        </div>
      )}
    </div>
  );
}
