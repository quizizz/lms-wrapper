import { MomentInput } from 'moment';

export function addSeconds(time: MomentInput, seconds: number): number;
export function addWeeks(date: Date, week?: number): number;
interface LMS {
  makeRequest<T>(req: RequestConfig, retry?: number): T;
}
export function paginatedCollect<T>(lms: LMS, req: RequestConfig): Promise<T[]>;
