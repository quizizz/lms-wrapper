import {AxiosRequestConfig} from 'axios';

interface RequestQuery {
  query?: {[_: string]: string};
}
interface RequestConfig extends AxiosRequestConfig, RequestQuery {}
