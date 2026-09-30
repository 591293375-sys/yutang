import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AUDIO_TRACKS,AmbientMixer,ambientDescription} from '../audio/ambient.js';
export function useAmbient(enabled,volume,weather,season,night,theme='koi'){
 const media=useRef({}),mixer=useRef(null);const [status,setStatus]=useState('off');
 const tracks=useMemo(()=>AUDIO_TRACKS.map(track=>({...track,url:`${import.meta.env.BASE_URL}assets/${track.file}`,ref:node=>{if(node)media.current[track.id]=node;else delete media.current[track.id]}})),[]);
 useEffect(()=>{const instance=new AmbientMixer({...media.current},setStatus);mixer.current=instance;return()=>{instance.destroy();mixer.current=null}},[]);
 useEffect(()=>{mixer.current?.configure({enabled,volume,weather,season,night,theme});if(theme==='cats')for(const audio of Object.values(media.current)){audio.volume=0;audio.pause()}},[enabled,volume,weather,season,night,theme]);
 const thunder=useCallback(event=>mixer.current?.thunder(event),[]);
 return {tracks,status,thunder,description:ambientDescription(weather,season,theme)};
}
