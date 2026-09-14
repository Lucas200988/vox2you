-- A channel's provider id (Meta phone_number_id) identifies exactly one unit across all tenants.
-- Inbound webhooks resolve the tenant from it, so the uniqueness must be global, not per tenant.
DROP INDEX "channels_tenant_id_kind_external_id_key";

CREATE UNIQUE INDEX "channels_kind_external_id_key" ON "channels"("kind", "external_id");
