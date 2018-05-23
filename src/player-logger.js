import {CustEvent} from 'chimee-helper';
import { PLAYER_EVENTS } from './player-events';

/**
 * 播放日志处理。收集播放器事件，集中处理
 */
class PlayerLogger extends CustEvent {

    constructor () {
        super();
        this.reset();
    }

    /**
     * 重置状态
     */
    reset () {
        this.loaderOpenTs = 0;
        this.receiveFirstPackageTs = 0;
        this.firstDemuxFlvTs = 0;
        this.firstSegmentTs = 0;
        this.firstPlay = 0;
    }

    /**
     * 记录事件及对应的数据
     * @param {object} event 事件数据
     * @param {string} type 事件类型
     */
    record (event) {
        event.ts = event.ts || Date.now();
        // 目前只记录播放前数据
        if(!this.firstPlay) {
            this.processFirstPlayData(event);
        }
    }

    /**
     * 处理播放开始前的数据
     * @param {object} event 事件数据
     * @param {number} event.ts 事件触发时间戳
     * @param {string} event.type 事件类型 
     */
    processFirstPlayData (event) {
        switch(event.type) {
            case PLAYER_EVENTS.LOADER_CHUNK_ARRIVAL:
                if(!this.receiveFirstPackageTs) {
                    this.receiveFirstPackageTs = event.ts;
                    this.emit('performance', {
                        type: 'receive-first-package-duration',
                        value: this.receiveFirstPackageTs - this.loaderOpenTs
                    });
                }
                break;
            case PLAYER_EVENTS.MEDIA_DEMUX_FLV:
                if(!this.firstDemuxFlvTs) {
                    this.firstDemuxFlvTs = event.ts;
                    this.emit('performance', {
                        type: 'first-flv-package-duration',
                        value: this.firstDemuxFlvTs - this.receiveFirstPackageTs
                    });
                }
                break;
            case PLAYER_EVENTS.MEDIA_SEGMENT:
                if(!this.firstSegmentTs) {
                    this.firstSegmentTs = event.ts;
                    this.emit('performance', {
                        type: 'first-flv-to-mp4',
                        value: this.firstSegmentTs - this.firstDemuxFlvTs
                    });
                }
                break;
            case PLAYER_EVENTS.LOADER_OPEN:
                if(!this.loaderOpenTs) {
                    this.loaderOpenTs = event.ts;
                    this.emit('performance', {
                        type: 'first_loader_open_timestamp',
                        value: this.loaderOpenTs
                    });
                }
                break;
            case PLAYER_EVENTS.PLAYING:
            case PLAYER_EVENTS.CANPLAY:
            case PLAYER_EVENTS.TIMEUPDATE:
                if(!this.firstPlay) {
                    this.firstPlay = event.ts;
                    this.emit('performance', {
                        type: 'first_video_frame_duration',
                        value: this.firstPlay - this.firstSegmentTs
                    });
                }
                break;
        }
    }
}

export default PlayerLogger;
