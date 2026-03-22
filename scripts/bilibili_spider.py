#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import json
import sys
import time
from typing import Dict, List, Optional

from bilibili_api import sync
from bilibili_api.user import User
from bilibili_api import search

class BilibiliSpider:
    """B站爬虫，支持搜索用户和获取视频"""
    
    async def search_user_async(self, keyword: str) -> Optional[Dict]:
      """异步搜索用户"""
      try:
          print(f"正在搜索用户: {keyword}", file=sys.stderr)
          
          # 使用 search 模块搜索用户
          result = await search.search_by_type(
              keyword=keyword,
              search_type=search.SearchObjectType.USER,
              page=1,
              page_size=10
          )
          
          if not result or not result.get('result'):
              print("未找到用户", file=sys.stderr)
              return None
          
          users = result['result']
          print(f"找到 {len(users)} 个相关用户", file=sys.stderr)
          
          # 打印第一个用户的结构，帮助调试
          if users:
              print(f"第一个用户的数据结构: {list(users[0].keys())}", file=sys.stderr)
          
          # 查找精确匹配的用户
          for u in users:
              # 注意：字段名是 uname 和 mid
              user_name = u.get('uname') or u.get('title') or u.get('name')
              user_id = u.get('mid') or u.get('id')
              
              if user_name == keyword:
                  print(f"精确匹配: {user_name} (UID: {user_id})", file=sys.stderr)
                  return {
                      'uid': user_id,
                      'name': user_name,
                      'videos': u.get('videos', 0)
                  }
          
          # 如果没有精确匹配，返回第一个
          if users:
              first = users[0]
              user_name = first.get('uname') or first.get('title') or first.get('name')
              user_id = first.get('mid') or first.get('id')
              print(f"返回第一个结果: {user_name} (UID: {user_id})", file=sys.stderr)
              return {
                  'uid': user_id,
                  'name': user_name,
                  'videos': first.get('videos', 0)
              }
          
          return None
      except Exception as e:
            print(f"搜索用户失败: {e}", file=sys.stderr)
            return None
      
    def search_user(self, keyword: str) -> Optional[Dict]:
        """同步搜索用户"""
        try:
            return sync(self.search_user_async(keyword))
        except Exception as e:
            print(f"同步调用失败: {e}", file=sys.stderr)
            return None
    
    async def get_videos_async(self, uid: int, count: int = 0) -> List[Dict]:
      """异步获取视频列表"""
      try:
          u = User(uid)
          videos = []
          page = 1
          page_size = 50
          
          while True:
              print(f"获取第 {page} 页视频...", file=sys.stderr)
              # 修正：参数名是 pn 和 ps
              video_list = await u.get_videos(pn=page, ps=page_size)
              
              if not video_list or not video_list.get('list'):
                  break
                  
              items = video_list['list']['vlist']
              if not items:
                  break
                  
              for v in items:
                  # 打印第一条视频的结构用于调试
                  if len(videos) == 0:
                      print(f"视频数据结构: {list(v.keys())}", file=sys.stderr)
                  # 👇 先初始化 duration 为默认值
                  duration = "0:00"
                  # 获取时长，处理可能的类型问题
                  length_raw = v.get('length', 0)
                  try:
                      duration = self._format_duration(length_raw)
                  except Exception as e:
                      print(f"时长转换失败: {length_raw}, {e}", file=sys.stderr)
                      duration = str(length_raw)
                  videos.append({
                      'bvid': v.get('bvid'),
                      'title': v.get('title'),
                      'created': self._format_date(v.get('created', 0)),
                      'views': v.get('play', 0),
                      'likes': v.get('likes', 0),
                      'favorites': v.get('favorites', 0),
                      'coins': v.get('coins', 0),
                      'danmaku': v.get('danmaku', 0),
                      'duration': self._format_duration(v.get('length', 0)),
                      'category': self._get_category(v.get('typeid', 0))
                  })
              
              print(f"第 {page} 页获取到 {len(items)} 条视频", file=sys.stderr)
              
              if len(items) < page_size:
                  break
              page += 1
          
          print(f"共获取 {len(videos)} 条视频", file=sys.stderr)
          
          if count > 0 and count < len(videos):
              videos = videos[:count]
          
          return videos
      except Exception as e:
          print(f"获取视频列表失败: {e}", file=sys.stderr)
          return []
    def get_videos(self, uid: int, count: int = 0) -> List[Dict]:
        """同步获取视频列表"""
        return sync(self.get_videos_async(uid, count))
    
    def _format_date(self, timestamp: int) -> str:
        import time
        return time.strftime('%Y-%m-%d', time.localtime(timestamp))
    
    def _format_duration(self, seconds) -> str:
      """格式化时长"""
      try:
          # 确保 seconds 是整数
          seconds = int(seconds)
          mins = seconds // 60
          secs = seconds % 60
          return f"{mins}:{secs:02d}"
      except (ValueError, TypeError):
          # 如果转换失败，返回原始值
          return str(seconds)
    
    def _get_category(self, typeid: int) -> str:
        categories = {
            1: '动画', 3: '音乐', 4: '游戏', 5: '娱乐',
            36: '科技', 119: '鬼畜', 155: '生活', 160: '时尚',
            181: '影视', 177: '纪录片', 23: '电影', 11: '电视剧', 188: '知识'
        }
        return categories.get(typeid, '其他')


def main():
    import argparse
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--action', required=True, choices=['search', 'videos'])
    parser.add_argument('--keyword')
    parser.add_argument('--uid', type=int)
    parser.add_argument('--count', type=int, default=0)
    
    args = parser.parse_args()
    spider = BilibiliSpider()
    
    if args.action == 'search':
        if not args.keyword:
            print(json.dumps({'error': '需要 keyword 参数'}))
            return
        result = spider.search_user(args.keyword)
        if result:
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(json.dumps({'error': '用户不存在'}))
    
    elif args.action == 'videos':
        if not args.uid:
            print(json.dumps({'error': '需要 uid 参数'}))
            return
        videos = spider.get_videos(args.uid, args.count)
        print(json.dumps(videos, ensure_ascii=False))


if __name__ == '__main__':
    main()