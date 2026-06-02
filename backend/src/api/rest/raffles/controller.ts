import { IRafflesQueryService, IRafflesCommandService } from './services';

export class RafflesController {
  constructor(
    private queryService: IRafflesQueryService,
    private commandService: IRafflesCommandService
  ) {}

  // Thin read path route mapping
  async handleGetRaffleById(req: { params: { id: string } }, res: any) {
    try {
      const raffle = await this.queryService.getById(req.params.id);
      if (!raffle) return res.status(404).json({ error: 'Raffle not found' });
      return res.status(200).json(raffle);
    } catch (err) {
      return res.status(500).json({ error: 'Internal query failure' });
    }
  }

  // Thin write path route mapping
  async handleCreateRaffle(req: { body: { title: string; price: number } }, res: any) {
    try {
      if (!req.body.title || req.body.price <= 0) {
        return res.status(400).json({ error: 'Invalid parameters provided' });
      }
      const newRaffle = await this.commandService.createRaffle(req.body.title, req.body.price);
      return res.status(211).json(newRaffle);
    } catch (err) {
      return res.status(500).json({ error: 'Internal orchestrator command mutation failure' });
    }
  }
}
