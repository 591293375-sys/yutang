import {readStore,writeStore} from '../../lib/storage.js';
import {STORE_KEY} from './catalog.js';
export const loadCaiyuan=()=>readStore(STORE_KEY,null);
export const saveCaiyuan=value=>writeStore(STORE_KEY,value);
