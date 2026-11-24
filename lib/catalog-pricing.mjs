const money = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'});

export function pricedModels(product) {
  return (product.pricedModels || []).map(model => {
    if (!model.sku || !Number.isFinite(model.price) || model.price <= 0 || !['MAP', 'MSRP', 'CUSTOM'].includes(model.priceBasis)) {
      throw new Error(`Invalid public catalog price for ${product.id}`);
    }
    return model;
  });
}

export const formatCatalogPrice = value => money.format(value);
export const modelQuoteName = (product, model) => `${product.name} · ${model.sku}`;

export function catalogQuoteOptions(catalog, slug) {
  const brand = catalog.brand || catalog.page.name;
  return catalog.products.filter(product => product.status !== 'legacy').flatMap(product => {
    const names = [product.name, ...pricedModels(product).map(model => modelQuoteName(product, model))];
    return names.map(name => ({
      brand, name, description: `${brand} · ${name}`,
      category: slug === 'arctic-wolf' ? 'Networking & security' : product.category,
      image: product.image,
    }));
  });
}
