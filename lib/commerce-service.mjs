import {createSimulationOrder,transitionOrder,simulationEvent,OrderError} from './commerce-order.mjs';
/** Repository must commit the entire revision + events + outbox atomically using CAS. */
export function createOrderLabService({repository,clock=()=>new Date().toISOString()}){
 return {
  async create({id,scenario}){const order=createSimulationOrder({id,scenario,createdAt:clock()});const result=await repository.create(order);if(!result.created&&result.order.scenario!==order.scenario)throw new OrderError(409,'Order ID already belongs to another simulation.');return result;},
  read:id=>repository.read(id),
  list:cursor=>repository.list(cursor),
  async action({id,eventId,action,expectedRevision}){
   const {order,etag}=await repository.read(id);
   // Duplicate clicks use the original payload and revision. Conflicting IDs never overwrite.
   const prior=order.events.find(e=>e.id===eventId);
   if(prior){if(prior.action!==action)throw new OrderError(409,'Event ID already belongs to another action.');return {order,duplicate:true};}
   if(expectedRevision!==order.revision)throw new OrderError(409,'Order changed. Refresh before retrying.');
   const event=simulationEvent(order,action,eventId,clock());const result=transitionOrder(order,event);
   result.order.events.at(-1).action=action;
   await repository.save(result.order,etag);
   return result;
  }
 };
}
export function createMemoryOrderRepository(){
 const records=new Map();return {
  async create(order){if(records.has(order.id))return {created:false,order:structuredClone(records.get(order.id))};records.set(order.id,structuredClone(order));return {created:true,order:structuredClone(order)};},
  async read(id){const o=records.get(id);if(!o)throw new OrderError(404,'Simulation not found.');return {order:structuredClone(o),etag:String(o.revision)};},
  async save(order,etag){const prior=records.get(order.id);if(!prior||String(prior.revision)!==etag)throw new OrderError(409,'Concurrent order update. Refresh before retrying.');records.set(order.id,structuredClone(order));},
  async list(){return [...records.values()].map(x=>structuredClone(x));}
 };
}
