
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MovieData } from '@/app/movies-lazy/page';
import VideoPlayer from './VideoPlayer';
import { EloRating } from '@/lib/eloRatingCache'; // 仅导入 EloRating 接口，不再导入函数

interface MovieDuelProps {
    allMovies: MovieData[];
    onExit: () => void;
}


const MovieDuel: React.FC<MovieDuelProps> = ({ allMovies, onExit }) => {
    const [leftMovie, setLeftMovie] = useState<MovieData | null>(null);
    const [rightMovie, setRightMovie] = useState<MovieData | null>(null);
    const [eloRatings, setEloRatings] = useState<Map<string, EloRating>>(new Map());
    const [isPlayingLeft, setIsPlayingLeft] = useState<boolean>(false); // 独立左侧播放状态
    const [isPlayingRight, setIsPlayingRight] = useState<boolean>(false); // 独立右侧播放状态
    const isInitialDuelSelected = useRef(false); // 新增一个 ref 来标记初始选片是否已完成

    // 负责首次加载 Elo 评分
    useEffect(() => {
        const fetchEloRatings = async () => {
            try {
                const response = await fetch('/api/elo-ratings');
                if (!response.ok) throw new Error('Failed to fetch Elo ratings');
                const ratingsArray: EloRating[] = await response.json();
                const newEloRatings = new Map(ratingsArray.map((r: EloRating) => [r.code, r]));
                setEloRatings(newEloRatings);
            } catch (error) {
                console.error("Error loading Elo ratings:", error);
                // 即使加载失败，也设置为空Map，避免一直处于加载中
                setEloRatings(new Map());
            }
        };
        fetchEloRatings();
    }, []); // 仅在组件挂载时运行一次

    const selectNewDuel = useCallback(() => {
        const validMovies = allMovies.filter(movie => movie.code);

        if (validMovies.length < 2) {
            alert("没有足够的影片进行对战！");
            onExit();
            return;
        }

        // 新算法：遍历一次找到 minMatchCount，避免全量排序
        let minMatchCount = Infinity;
        for (const movie of validMovies) {
            const count = eloRatings.get(movie.code!)?.matchCount || 0;
            if (count < minMatchCount) {
                minMatchCount = count;
            }
        }

        // 再遍历一次，收集所有 matchCount 等于 minMatchCount 的影片
        let leastRatedPool = validMovies.filter(movie => (eloRatings.get(movie.code!)?.matchCount || 0) === minMatchCount);
        
        // 如果 Elo 评分为空（例如第一次加载），则 leastRatedPool 可能是所有影片
        // 或者 leastRatedPool 中只有一部影片，无法选出两部
        if (leastRatedPool.length < 2) {
             console.warn("当前 Elo 评分最少的影片不足两部，或 Elo 评分为空，从所有有效影片中随机选择。");
             leastRatedPool = validMovies; // 此时使用所有有效影片
             if (leastRatedPool.length < 2) {
                 alert("没有足够的影片进行对战！");
                 onExit();
                 return;
             }
        }

        let index1 = Math.floor(Math.random() * leastRatedPool.length);
        let index2 = Math.floor(Math.random() * (leastRatedPool.length - 1));
        if (index2 >= index1) {
            index2++;
        }

        setLeftMovie(leastRatedPool[index1]);
        setRightMovie(leastRatedPool[index2]);
        setIsPlayingLeft(false); // 重置播放状态
        setIsPlayingRight(false); // 重置播放状态
    }, [allMovies, eloRatings, onExit]); // selectNewDuel 的依赖

    // 负责在 allMovies 和 eloRatings 都加载完成时，选出第一对影片
    useEffect(() => {
        if (
            allMovies.length > 0 &&
            eloRatings.size >= 0 &&
            !isInitialDuelSelected.current // 检查标记
        ) {
            selectNewDuel();
            isInitialDuelSelected.current = true; // 设置标记，防止重复选片
        }
    }, [allMovies, eloRatings, selectNewDuel]);


    const handleRating = useCallback(async (winner: 'left' | 'right' | 'draw') => {
        if (!leftMovie?.code || !rightMovie?.code) return;

        let resultString: 'winA' | 'winB' | 'draw';
        if (winner === 'left') {
            resultString = 'winA';
        } else if (winner === 'right') {
            resultString = 'winB';
        } else {
            resultString = 'draw';
        }

        try {
            const response = await fetch('/api/elo-ratings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    codeA: leftMovie.code,
                    codeB: rightMovie.code,
                    result: resultString,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update Elo ratings');
            }

            const { updatedRatingA, updatedRatingB } = await response.json();

            // 直接根据 API 返回的数据更新内存中的评分
            setEloRatings(prev => {
                const newRatings = new Map(prev);
                newRatings.set(updatedRatingA.code, updatedRatingA);
                newRatings.set(updatedRatingB.code, updatedRatingB);
                return newRatings;
            });

            selectNewDuel(); // 继续下一轮对战
        } catch (error) {
            console.error("Error updating Elo ratings:", error);
            alert(`更新评分失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [leftMovie, rightMovie, selectNewDuel]);

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        switch (event.code) {
            case 'KeyA':
                handleRating('left');
                break;
            case 'KeyD':
                handleRating('right');
                break;
            case 'Space':
                handleRating('draw');
                break;
            default:
                break;
        }
    }, [handleRating]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
    
    const renderMovie = (movie: MovieData | null, side: 'left' | 'right') => {
        if (!movie) return <div className="w-full h-full bg-gray-800 animate-pulse" />;

        const isPlaying = (side === 'left' && isPlayingLeft) || (side === 'right' && isPlayingRight);

        if (isPlaying) {
            return (
                <div className="w-full">
                    <VideoPlayer
                        src={`/api/video/stream?path=${btoa(encodeURIComponent(movie.absolutePath))}`}
                        filepath={movie.absolutePath}
                        filename={movie.filename}
                        onEnded={() => {
                            if (side === 'left') setIsPlayingLeft(false);
                            else setIsPlayingRight(false);
                        }}
                        autoPlay={false} // 显式设置为 false
                    />
                </div>
            );
        }

        return (
            <div onClick={() => {
                if (side === 'left') setIsPlayingLeft(true);
                else setIsPlayingRight(true);
            }} className="cursor-pointer">
                <img
                    src={movie.coverUrl || '/placeholder-image.svg'}
                    alt={`${side} movie cover`}
                    className="w-full h-auto object-cover"
                />
                <h2 className="text-white mt-2 truncate" title={movie.code}>{movie.code}</h2>
                <p className="text-gray-400">Elo: {eloRatings.get(movie.code!)?.elo || 1000}</p>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 flex flex-col justify-center items-center h-screen bg-black/90 backdrop-blur-sm z-50">
            <div className="absolute top-4 right-4">
                <button onClick={onExit} className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600">退出对战</button>
            </div>
            <div className="flex w-full max-w-5xl justify-around items-start">
                <div className="w-1/2 p-4 text-center">
                    {renderMovie(leftMovie, 'left')}
                </div>
                <div className="w-1/2 p-4 text-center">
                    {renderMovie(rightMovie, 'right')}
                </div>
            </div>
            <div className="text-white mt-4 text-lg">
                <p>按 <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">A</kbd> 选择左边，<kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">D</kbd> 选择右边，<kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">空格</kbd> 表示平局。</p>
            </div>
        </div>
    );
};

export default MovieDuel;
