/* eslint-disable */
import flvparse from './flv/flvParse';
import tagdemux from './flv/tagdemux';
import mp4remux from './mp4/mp4remux';
import mp4moof from './mp4/mp4moof';
import {CustEvent} from 'chimee-helper-events';
import Error from './utils/error'
class flv2fmp4 {

    /**
     * Creates an instance of flv2fmp4.
     * config 里面有_isLive属性,是否是直播
     * @param {any} config
     *
     * @memberof flv2fmp4
     */
    constructor(config) {
        mp4remux.init();
        this._config = config;

        // 外部方法赋值
        this.onInitSegment = null;
        this.onMediaSegment = null;
        this.onMediaInfo = null;
        this.seekCallBack = null;
        this._onCdnDropFrame = null;

        // 内部使用
        this.loadmetadata = false;
        this.ftyp_moov = null;//单路
        this._tagdemux = new tagdemux();
        this._flvparse = new flvparse();
        this.ftyp_moov_v=null;//双路视频
        this.ftyp_moov_a=null;//双路音频
        this.metaSuccRun = false;
        this.metas = [];
        this.parseChunk = null;
        this.hasVideo = false;
        this.hasAudio = false;
        this._error=null;
        // 临时记录seek时间
        this._pendingResolveSeekPoint = -1;

        // 临时记录flv数据起始时间
        this._tempBaseTime = 0;

        // 处理flv数据入口
        this.setflvBase = this.setflvBasefrist;

        this._tagdemux._onTrackMetadata = this.Metadata.bind(this);
        this._tagdemux._onMediaInfo = this.metaSucc.bind(this);
        this._tagdemux._onDataAvailable = this.onDataAvailable.bind(this);
        this._tagdemux._onError=this.error.bind(this);
        this._tagdemux._onCdnDropFrame = this.onCdnDropFrame.bind(this);
        this.m4mof = new mp4moof(this._config);
        this.m4mof.onMediaSegment = this.onMdiaSegment.bind(this);
    }
    seek(baseTime) {
        this._flvparse.dispose();
        this.setflvBase = this.setflvBasefrist;
        if (baseTime == undefined || baseTime == 0) {
            baseTime = 0;
            this._pendingResolveSeekPoint = -1;
        }
        if (this._tempBaseTime != baseTime) {
            this._tempBaseTime = baseTime;
            this._tagdemux._timestampBase = baseTime;
            this.m4mof.seek(baseTime);
            this.m4mof.insertDiscontinuity();
            this._pendingResolveSeekPoint = baseTime;
        }
    }

    /**
     * 不要主动调用这个接口!!!!!!!!!!!!!!!!!!!!!!!!!!!!
     * 第一次接受数据,和seek时候接受数据入口,
     *
     * @param {any} arraybuff
     * @param {any} baseTime
     * @returns
     *
     * @memberof flv2fmp4
     */
    setflvBasefrist(arraybuff, baseTime) {

        let offset = 0;
        try {
            offset = this._flvparse.setFlv(new Uint8Array(arraybuff));
        } catch (error) {
            this.error(error);
        }
        if(this._flvparse.arrTag.length==0)return offset;
        // if(this._flvparse.arrTag[0].tagType!=18){
        //     if(this.error)this.error(new Error('without metadata tag'));
        // }
        if (this._flvparse.arrTag.length > 0) {
            this._tagdemux.hasAudio=this.hasAudio = this._flvparse._hasAudio;
            this._tagdemux.hasVideo=this.hasVideo = this._flvparse._hasVideo;
            
            if (this._tempBaseTime != 0 && this._tempBaseTime == this._flvparse.arrTag[0].getTime()) {
                this._tagdemux._timestampBase = 0;
            }
            try {
                this._tagdemux.moofTag(this._flvparse.arrTag);
            } catch (error) {
                this.error(error);
            }
            this.setflvBase = this.setflvBaseUsually;
        }

        return offset;
    }

    /**
     * 不要主动调用这个接口!!!!!!!!!!!!!!!!!!!!!!!!!!!!
     * 后续接受数据接口
     * @param {any} arraybuff
     * @param {any} baseTime
     * @returns
     *
     * @memberof flv2fmp4
     */
    setflvBaseUsually(arraybuff, baseTime) {
        let offset =0;
        try {
            offset = this._flvparse.setFlv(new Uint8Array(arraybuff));
        } catch (error) {
            this.error(error);
        }
        if (this._flvparse.arrTag.length > 0) {
            try {
                this._tagdemux.moofTag(this._flvparse.arrTag);
            } catch (error) {
                this.error(error);
            }
        }

        return offset;
    }

    /**
     * 不要主动调用这个接口!!!!!!!!!!!!!!!!!!!!!!!!!!!!
     * moof回调
     *
     * @param {any} track
     * @param {any} value
     *
     * @memberof flv2fmp4
     */
    onMdiaSegment(track, value) {

        if (this.onMediaSegment) {
            this.onMediaSegment(track,new Uint8Array(value.data));
        }
        if (this._pendingResolveSeekPoint != -1 && track == 'video') {
            let seekpoint = this._pendingResolveSeekPoint;
            this._pendingResolveSeekPoint = -1;
            if (this.seekCallBack) {
                this.seekCallBack(seekpoint);
            }
        }
    }

    /**
     *
     * 音频和视频的初始化tag
     *
     * @param {any} type
     * @param {any} meta
     *
     * @memberof flv2fmp4
     */
    Metadata(type, meta) {
        switch (type) {
            case 'video':
                this.metas.push(['video',meta]);
                this.m4mof._videoMeta = meta;
                if (this.hasVideo && !this.hasAudio) {
                    this.metaSucc();
                    return;
                }
                break;
            case 'audio':
                this.metas.push(['audio',meta]);
                this.m4mof._audioMeta = meta;
                if (!this.hasVideo && this.hasAudio) {
                    this.metaSucc();
                    return;
                }
                break;
        }
        if (this.hasVideo && this.hasAudio  && this.m4mof._videoMeta && this.m4mof._audioMeta) {
            this.metaSucc();
        }
    }

    /**
     * metadata解读成功后触发及第一个视频tag和第一个音频tag
     *
     * @param {any} mi
     * @returns
     *
     * @memberof flv2fmp4
     */
    metaSucc(mi) {
        if (this.onMediaInfo&&mi) {
            
            this.onMediaInfo(mi||this._tagdemux._mediaInfo, { hasAudio: this.hasAudio, hasVideo: this.hasVideo });
        }
        // 获取ftyp和moov
        if (this.metas.length == 0) {
            this.metaSuccRun = true;
            return;
        }
        if(mi)return;
        if(this.metas.length>1){
            // this.ftyp_moov_v=
            this.metas.map(item=>{
                if(item[0]=='video'){
                    this.ftyp_moov_v=mp4remux.generateInitSegment([item[1]]);
                }else{
                    this.ftyp_moov_a=mp4remux.generateInitSegment([item[1]]);
                }
            })
        }else{
            this.ftyp_moov = mp4remux.generateInitSegment([this.metas[0][1]]);
        }
        
        if (this.onInitSegment && this.loadmetadata == false) {

            if(this.ftyp_moov)
            {
                this.onInitSegment(this.ftyp_moov);
            }else{
                this.onInitSegment(this.ftyp_moov_v,this.ftyp_moov_a);
            }
            this.loadmetadata = true;
        }
    }

    onDataAvailable(audiotrack, videotrack) {
        // this.m4mof.remux(audiotrack, videotrack);

        try{
            this.m4mof.remux(audiotrack, videotrack);
        }catch(e){
            this.error(e);
        }
    }
    
    /**
     * cdn丢帧回调
     */
    onCdnDropFrame (data) {
        if(this._onCdnDropFrame) this._onCdnDropFrame(data);
    }

    /**
     * 传入flv的二进制数据
     * 统一入口
     * @param {any} arraybuff
     * @param {any} baseTime flv数据开始时间
     * @returns
     *
     * @memberof flv2fmp4
     */
    setflv(arraybuff, baseTime) {
        return this.setflvBase(arraybuff, baseTime);
    }

    /**
     *
     * 本地调试代码,不用理会
     * @param {any} arraybuff
     * @returns
     *
     * @memberof flv2fmp4
     */
    setflvloc(arraybuff) {
        const offset = flvparse.setFlv(new Uint8Array(arraybuff));

        if (flvparse.arrTag.length > 0) {
            return flvparse.arrTag;
        }
    }
    /**
     * 
     *  异常抛出处理
     * @param {any} e 
     * @memberof flv2fmp4
     */
    error(e) {
        if(this._error){
            this._error(e);
        }
    }
}

/**
 * 封装的对外类,有些方法不想对外暴露,所以封装这么一个类
 *
 * @class foreign
 */
class foreign extends CustEvent {
    constructor(config) {
        super();
        this.f2m = new flv2fmp4(config);
        this.f2m._error=this.error.bind(this);
        // 外部方法赋值
        this._onInitSegment = null;
        this._onMediaSegment = null;
        this._onMediaInfo = null;
        this._seekCallBack = null;
    }
    error(e){
        this.emit('error',e.type);
    }
    /**
     *
     * 跳转
     * @param {any} basetime  跳转时间
     *
     * @memberof foreign
     */
    seek(basetime) {
        this.f2m.seek(basetime);
    }

    /**
     * 传入flv的二进制数据
     * 统一入口
     * @param {any} arraybuff
     * @returns
     *
     * @memberof flv2fmp4
     */
    setflv(arraybuff) {
        return this.f2m.setflv(arraybuff, 0);
    }

    /**
     *
     * 本地调试代码,不用理会
     * @param {any} arraybuff
     * @returns
     *
     * @memberof flv2fmp4
     */
    setflvloc(arraybuff) {
        return this.f2m.setflvloc(arraybuff);
    }

    /**
     * 赋值初始化seg接受方法
     *
     *
     * @memberof foreign
     */
    set onInitSegment(fun) {
        this._onInitSegment = fun;
        this.f2m.onInitSegment = fun;
    }

    /**
     * 赋值moof接受方法
     *
     *
     * @memberof foreign
     */
    set onMediaSegment(fun) {
        this._onMediaSegment = fun;
        this.f2m.onMediaSegment = fun;
    }

    /**
     * 赋值metadata接受方法
     *
     *
     * @memberof foreign
     */
    set onMediaInfo(fun) {
        this._onMediaInfo = fun;
        this.f2m.onMediaInfo = fun;
    }

    /**
     * 赋值是否跳转回调接受方法
     *
     *
     * @memberof foreign
     */
    set seekCallBack(fun) {
        this._seekCallBack = fun;
        this.f2m.seekCallBack = fun;
    }

    /**
     * cdn丢帧回调
     */
    set onCdnDropFrame(fun) {
        console.log('set fun');
        this.f2m._onCdnDropFrame = fun;
    }
}

export default foreign;