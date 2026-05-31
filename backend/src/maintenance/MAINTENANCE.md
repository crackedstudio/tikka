## Maintenance Scopes

Supported scopes:

- all → blocks all requests
- writes → blocks POST, PUT, PATCH, DELETE
- raffles → blocks raffle endpoints
- notifications → blocks notification flows
- monitor → blocks monitoring endpoints

## Environment Variables

MAINTENANCE_MODE=true
MAINTENANCE_SCOPES=all,writes